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
import { Plus, Search, FileText, Trash2, Eye, Download, Check } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import InvoiceForm from "./InvoiceForm";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
}

interface InvoiceItem {
  id: string;
  invoiceId: string;
  itemId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
  itemName?: string;
}

interface CompanyData {
  companyName: string;
  companyStreet: string;
  companyPostalCode: string;
  companyCity: string;
  companyPhone: string;
  companyFax: string;
  companyEmail: string;
  companyLogoUrl: string;
}

export default function ClinicInvoices() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceWithItems, setInvoiceWithItems] = useState<InvoiceWithItems | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

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

  const { data: companyData } = useQuery<CompanyData>({
    queryKey: ['/api/clinic', hospitalId, 'company-data'],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/company-data`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch company data');
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

  const handleViewInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);
    
    try {
      const res = await fetch(`/api/clinic/${hospitalId}/invoices/${invoice.id}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const invoiceData = await res.json();
        setInvoiceWithItems(invoiceData);
      }
    } catch (error) {
      console.error('Failed to fetch invoice items:', error);
    }
  };

  const generateInvoicePDF = async () => {
    if (!invoiceWithItems || !companyData) return;
    
    setIsPdfLoading(true);
    
    try {
      const doc = new jsPDF();
      const invoice = invoiceWithItems;
      const isGerman = i18n.language === 'de';
      
      // Add company logo if available
      let logoYOffset = 0;
      if (companyData.companyLogoUrl) {
        try {
          // Load the logo image
          const logoImg = new Image();
          logoImg.crossOrigin = 'Anonymous';
          await new Promise<void>((resolve, reject) => {
            logoImg.onload = () => resolve();
            logoImg.onerror = () => reject();
            logoImg.src = companyData.companyLogoUrl;
          });
          
          // Flatten transparent PNG onto white background using canvas
          // jsPDF doesn't support transparency and renders transparent areas as black
          const canvas = document.createElement('canvas');
          canvas.width = logoImg.width;
          canvas.height = logoImg.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Fill with white background first
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Draw the logo on top
            ctx.drawImage(logoImg, 0, 0);
          }
          
          // Calculate aspect ratio and add to PDF
          const maxLogoWidth = 40;
          const maxLogoHeight = 20;
          const aspectRatio = logoImg.width / logoImg.height;
          let logoWidth = maxLogoWidth;
          let logoHeight = logoWidth / aspectRatio;
          if (logoHeight > maxLogoHeight) {
            logoHeight = maxLogoHeight;
            logoWidth = logoHeight * aspectRatio;
          }
          
          // Use the flattened canvas image instead of original
          const flattenedLogoUrl = canvas.toDataURL('image/png');
          doc.addImage(flattenedLogoUrl, 'PNG', 20, 10, logoWidth, logoHeight);
          logoYOffset = logoHeight + 5;
        } catch (e) {
          // Logo failed to load, continue without it
          console.warn('Failed to load company logo for PDF:', e);
        }
      }
      
      doc.setFontSize(18);
      doc.text(isGerman ? "RECHNUNG" : "INVOICE", 20, 15 + logoYOffset);
      
      doc.setFontSize(10);
      let yPos = 30 + logoYOffset;
      
      if (companyData.companyName) {
        doc.setFontSize(12);
        doc.text(companyData.companyName, 20, yPos);
        yPos += 5;
        doc.setFontSize(10);
      }
      if (companyData.companyStreet) {
        doc.text(companyData.companyStreet, 20, yPos);
        yPos += 5;
      }
      if (companyData.companyPostalCode || companyData.companyCity) {
        doc.text(`${companyData.companyPostalCode} ${companyData.companyCity}`.trim(), 20, yPos);
        yPos += 5;
      }
      if (companyData.companyPhone) {
        doc.text(`${isGerman ? 'Tel' : 'Phone'}: ${companyData.companyPhone}`, 20, yPos);
        yPos += 5;
      }
      if (companyData.companyEmail) {
        doc.text(`${isGerman ? 'E-Mail' : 'Email'}: ${companyData.companyEmail}`, 20, yPos);
        yPos += 5;
      }
      
      doc.setFontSize(10);
      doc.text(`${isGerman ? 'Rechnung Nr.' : 'Invoice No.'}: ${invoice.invoiceNumber}`, 140, 30 + logoYOffset);
      doc.text(`${isGerman ? 'Datum' : 'Date'}: ${format(new Date(invoice.date), 'PP', { locale: dateLocale })}`, 140, 37 + logoYOffset);
      
      yPos = Math.max(yPos + 10, 65);
      doc.setFontSize(11);
      doc.text(isGerman ? "Rechnungsempfänger:" : "Bill To:", 20, yPos);
      yPos += 6;
      doc.setFontSize(10);
      doc.text(invoice.customerName, 20, yPos);
      yPos += 5;
      if (invoice.customerAddress) {
        const addressLines = invoice.customerAddress.split('\n');
        addressLines.forEach(line => {
          doc.text(line, 20, yPos);
          yPos += 5;
        });
      }
      
      yPos += 10;
      
      const tableHeaders = [
        [
          isGerman ? 'Beschreibung' : 'Description',
          isGerman ? 'Menge' : 'Qty',
          isGerman ? 'Preis' : 'Price',
          'Total'
        ]
      ];
      
      const tableData = invoice.items.map(item => [
        item.description,
        item.quantity.toString(),
        `CHF ${parseFloat(item.unitPrice).toFixed(2)}`,
        `CHF ${parseFloat(item.total).toFixed(2)}`
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: tableHeaders,
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [60, 60, 60],
          textColor: [255, 255, 255],
        },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 25, halign: 'center' },
          2: { cellWidth: 35, halign: 'right' },
          3: { cellWidth: 35, halign: 'right' },
        },
        margin: { left: 20, right: 20 },
      });
      
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      
      doc.setFontSize(10);
      doc.text(isGerman ? 'Zwischensumme:' : 'Subtotal:', 130, finalY);
      doc.text(`CHF ${parseFloat(invoice.subtotal).toFixed(2)}`, 190, finalY, { align: 'right' });
      
      doc.text(`${isGerman ? 'MwSt.' : 'VAT'} (${invoice.vatRate}%):`, 130, finalY + 6);
      doc.text(`CHF ${parseFloat(invoice.vatAmount).toFixed(2)}`, 190, finalY + 6, { align: 'right' });
      
      doc.setLineWidth(0.5);
      doc.line(130, finalY + 10, 190, finalY + 10);
      
      doc.setFontSize(12);
      doc.setFont(undefined as any, 'bold');
      // Position labels on the left, values on the right to avoid overlap
      doc.text(isGerman ? 'Gesamtbetrag:' : 'Total:', 130, finalY + 17);
      doc.text(`CHF ${parseFloat(invoice.total).toFixed(2)}`, 190, finalY + 17, { align: 'right' });
      
      doc.setFont(undefined as any, 'normal');
      
      if (invoice.comments) {
        doc.setFontSize(10);
        doc.text(isGerman ? 'Bemerkungen:' : 'Comments:', 20, finalY + 30);
        doc.text(invoice.comments, 20, finalY + 36);
      }
      
      doc.save(`${isGerman ? 'Rechnung' : 'Invoice'}_${invoice.invoiceNumber}.pdf`);
      
      toast({
        title: t('clinic.invoices.pdfGenerated'),
        description: t('clinic.invoices.pdfGeneratedDescription'),
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: t('common.error'),
        description: t('clinic.invoices.pdfError'),
        variant: "destructive",
      });
    } finally {
      setIsPdfLoading(false);
    }
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
                      CHF {parseFloat(invoice.total).toFixed(2)}
                    </p>
                    <div className="flex gap-1 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewInvoice(invoice)}
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

      <Dialog open={viewDialogOpen} onOpenChange={(open) => {
        setViewDialogOpen(open);
        if (!open) {
          setInvoiceWithItems(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('clinic.invoices.invoice')} #{selectedInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t('clinic.invoices.customer')}</p>
                  <p className="font-medium">{selectedInvoice.customerName}</p>
                  {selectedInvoice.customerAddress && (
                    <p className="text-sm whitespace-pre-line">{selectedInvoice.customerAddress}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('clinic.invoices.date')}</p>
                  <p className="font-medium">
                    {format(new Date(selectedInvoice.date), 'PP', { locale: dateLocale })}
                  </p>
                </div>
              </div>

              {invoiceWithItems?.items && invoiceWithItems.items.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-2">{t('clinic.invoices.lineItems')}</p>
                  <div className="space-y-2">
                    {invoiceWithItems.items.map((item, index) => (
                      <div key={item.id} className="flex justify-between text-sm bg-muted/50 p-2 rounded" data-testid={`invoice-item-${index}`}>
                        <div className="flex-1">
                          <span className="font-medium">{item.description}</span>
                          <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                        </div>
                        <span>CHF {parseFloat(item.total).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span>{t('clinic.invoices.subtotal')}</span>
                  <span>CHF {parseFloat(selectedInvoice.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{t('clinic.invoices.vat')} ({selectedInvoice.vatRate}%)</span>
                  <span>CHF {parseFloat(selectedInvoice.vatAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t mt-2 pt-2">
                  <span>{t('clinic.invoices.total')}</span>
                  <span>CHF {parseFloat(selectedInvoice.total).toFixed(2)}</span>
                </div>
              </div>
              {selectedInvoice.comments && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground">{t('clinic.invoices.comments')}</p>
                  <p className="text-sm">{selectedInvoice.comments}</p>
                </div>
              )}

              <div className="border-t pt-4 flex justify-end">
                <Button
                  onClick={generateInvoicePDF}
                  disabled={isPdfLoading || !invoiceWithItems}
                  data-testid="button-download-pdf"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isPdfLoading ? t('common.loading') : t('clinic.invoices.downloadPdf')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
