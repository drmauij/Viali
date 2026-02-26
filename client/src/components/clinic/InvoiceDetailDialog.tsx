import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Mail, Loader2, Check, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
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
  pharmacode?: string | null;
  gtin?: string | null;
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

export interface InvoiceDetailDialogProps {
  hospitalId: string;
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

export function InvoiceDetailDialog({
  hospitalId,
  invoiceId,
  open,
  onClose,
  onStatusChange,
}: InvoiceDetailDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dateLocale = i18n.language === "de" ? de : enUS;

  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [saveEmailToPatient, setSaveEmailToPatient] = useState(false);
  const [isEmailSending, setIsEmailSending] = useState(false);

  const { data: companyData } = useQuery<CompanyData>({
    queryKey: ["/api/clinic", hospitalId, "company-data"],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/company-data`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch company data");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: invoiceWithItems } = useQuery<InvoiceWithItems>({
    queryKey: ["/api/clinic", hospitalId, "invoices", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/invoices/${invoiceId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: open && !!invoiceId,
  });

  const { data: patientEmailData } = useQuery<{ email: string | null }>({
    queryKey: ["/api/clinic", hospitalId, "invoices", invoiceId, "patient-email"],
    queryFn: async () => {
      const res = await fetch(
        `/api/clinic/${hospitalId}/invoices/${invoiceId}/patient-email`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch patient email");
      return res.json();
    },
    enabled: open && !!invoiceId,
  });

  const patientEmail = patientEmailData?.email ?? null;

  useEffect(() => {
    if (patientEmail) {
      setEmailAddress(patientEmail);
    }
  }, [patientEmail]);

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/clinic/${hospitalId}/invoices/${invoiceId}/status`, {
        status: "paid",
      });
    },
    onSuccess: () => {
      toast({
        title: t("clinic.invoices.markedPaid", "Marked as Paid"),
        description: t(
          "clinic.invoices.markedPaidDescription",
          "Invoice has been marked as paid"
        ),
      });
      onStatusChange?.();
      onClose();
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t(
          "clinic.invoices.markPaidError",
          "Failed to mark invoice as paid"
        ),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/clinic/${hospitalId}/invoices/${invoiceId}`);
    },
    onSuccess: () => {
      toast({
        title: t("clinic.invoices.deleted", "Invoice deleted"),
        description: t("clinic.invoices.deletedDescription", "The invoice has been deleted"),
      });
      onStatusChange?.();
      onClose();
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("clinic.invoices.deleteError", "Failed to delete invoice"),
        variant: "destructive",
      });
    },
  });

  const buildPDF = async (): Promise<jsPDF | null> => {
    if (!invoiceWithItems || !companyData) return null;

    const doc = new jsPDF();
    const invoice = invoiceWithItems;
    const isGerman = i18n.language === "de";

    let logoYOffset = 0;
    if (companyData.companyLogoUrl) {
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = "Anonymous";
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          logoImg.src = companyData.companyLogoUrl;
        });

        const scaleFactor = 4;
        const canvas = document.createElement("canvas");
        const origWidth = logoImg.naturalWidth || logoImg.width;
        const origHeight = logoImg.naturalHeight || logoImg.height;
        canvas.width = origWidth * scaleFactor;
        canvas.height = origHeight * scaleFactor;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(logoImg, 0, 0, canvas.width, canvas.height);
        }

        const maxLogoWidth = 80;
        const maxLogoHeight = 50;
        const aspectRatio = origWidth / origHeight;
        let logoWidth = maxLogoWidth;
        let logoHeight = logoWidth / aspectRatio;
        if (logoHeight > maxLogoHeight) {
          logoHeight = maxLogoHeight;
          logoWidth = logoHeight * aspectRatio;
        }

        const pageWidth = doc.internal.pageSize.getWidth();
        const logoX = (pageWidth - logoWidth) / 2;
        const flattenedLogoUrl = canvas.toDataURL("image/png");
        doc.addImage(flattenedLogoUrl, "PNG", logoX, 10, logoWidth, logoHeight);
        logoYOffset = logoHeight + 10;
      } catch (e) {
        console.warn("Failed to load company logo for PDF:", e);
      }
    }

    doc.setFontSize(18);
    doc.text(isGerman ? "RECHNUNG" : "INVOICE", 20, 18 + logoYOffset);

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
      doc.text(
        `${companyData.companyPostalCode} ${companyData.companyCity}`.trim(),
        20,
        yPos
      );
      yPos += 5;
    }
    if (companyData.companyPhone) {
      doc.text(`${isGerman ? "Tel" : "Phone"}: ${companyData.companyPhone}`, 20, yPos);
      yPos += 5;
    }
    if (companyData.companyEmail) {
      doc.text(
        `${isGerman ? "E-Mail" : "Email"}: ${companyData.companyEmail}`,
        20,
        yPos
      );
      yPos += 5;
    }

    doc.setFontSize(10);
    doc.text(
      `${isGerman ? "Rechnung Nr." : "Invoice No."}: ${invoice.invoiceNumber}`,
      140,
      30 + logoYOffset
    );
    doc.text(
      `${isGerman ? "Datum" : "Date"}: ${format(new Date(invoice.date), "PP", {
        locale: dateLocale,
      })}`,
      140,
      37 + logoYOffset
    );

    yPos = Math.max(yPos + 10, 65);
    doc.setFontSize(11);
    doc.text(isGerman ? "Rechnungsempfänger:" : "Bill To:", 20, yPos);
    yPos += 6;
    doc.setFontSize(10);
    doc.text(invoice.customerName, 20, yPos);
    yPos += 5;
    if (invoice.customerAddress) {
      const addressLines = invoice.customerAddress.split("\n");
      addressLines.forEach((line) => {
        doc.text(line, 20, yPos);
        yPos += 5;
      });
    }

    yPos += 10;

    const tableHeaders = [
      [
        isGerman ? "Beschreibung" : "Description",
        isGerman ? "Menge" : "Qty",
        isGerman ? "Preis" : "Price",
        "Total",
      ],
    ];

    const tableData = invoice.items.map((item) => {
      let description = item.description;
      const codes: string[] = [];
      if (item.pharmacode) codes.push(`Pharmacode: ${item.pharmacode}`);
      if (item.gtin) codes.push(`GTIN: ${item.gtin}`);
      if (codes.length > 0) {
        description += `\n${codes.join(" | ")}`;
      }
      return [
        description,
        item.quantity.toString(),
        formatCurrency(item.unitPrice),
        formatCurrency(item.total),
      ];
    });

    const rightMargin = 25;
    const tableRightEdge = 210 - rightMargin;

    autoTable(doc, {
      startY: yPos,
      head: tableHeaders,
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 75 },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: 35, halign: "right" },
      },
      margin: { left: 20, right: rightMargin },
      styles: { cellPadding: 2, fontSize: 9 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(10);
    doc.text(isGerman ? "Zwischensumme:" : "Subtotal:", 120, finalY);
    doc.text(formatCurrency(invoice.subtotal), tableRightEdge, finalY, {
      align: "right",
    });

    doc.text(
      `${isGerman ? "MwSt." : "VAT"} (${invoice.vatRate}%):`,
      120,
      finalY + 6
    );
    doc.text(formatCurrency(invoice.vatAmount), tableRightEdge, finalY + 6, {
      align: "right",
    });

    doc.setLineWidth(0.5);
    doc.line(120, finalY + 10, tableRightEdge, finalY + 10);

    doc.setFontSize(12);
    doc.setFont(undefined as any, "bold");
    doc.text(isGerman ? "Gesamtbetrag:" : "Total:", 120, finalY + 17);
    doc.text(formatCurrency(invoice.total), tableRightEdge, finalY + 17, {
      align: "right",
    });

    doc.setFont(undefined as any, "normal");

    if (invoice.comments) {
      doc.setFontSize(10);
      doc.text(isGerman ? "Bemerkungen:" : "Comments:", 20, finalY + 30);
      doc.text(invoice.comments, 20, finalY + 36);
    }

    return doc;
  };

  const generatePDFBase64 = async (): Promise<string | null> => {
    const doc = await buildPDF();
    if (!doc) return null;
    const pdfOutput = doc.output("datauristring");
    return pdfOutput.split(",")[1];
  };

  const generateInvoicePDF = async () => {
    if (!invoiceWithItems || !companyData) return;

    setIsPdfLoading(true);
    try {
      const doc = await buildPDF();
      if (!doc) throw new Error("Failed to generate PDF");

      const isGerman = i18n.language === "de";
      doc.save(`${isGerman ? "Rechnung" : "Invoice"}_${invoiceWithItems.invoiceNumber}.pdf`);

      toast({
        title: t("clinic.invoices.pdfGenerated"),
        description: t("clinic.invoices.pdfGeneratedDescription"),
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: t("common.error"),
        description: t("clinic.invoices.pdfError"),
        variant: "destructive",
      });
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailAddress || !invoiceWithItems) return;

    setIsEmailSending(true);
    try {
      const pdfBase64 = await generatePDFBase64();
      if (!pdfBase64) throw new Error("Failed to generate PDF");

      await apiRequest(
        "POST",
        `/api/clinic/${hospitalId}/invoices/${invoiceId}/send-email`,
        {
          email: emailAddress,
          pdfBase64,
          language: i18n.language,
          saveEmailToPatient: saveEmailToPatient && emailAddress !== patientEmail,
        }
      );

      toast({
        title: t("clinic.invoices.emailSent"),
        description: t("clinic.invoices.emailSentDescription"),
      });

      setShowEmailForm(false);
    } catch (error) {
      console.error("Failed to send email:", error);
      toast({
        title: t("common.error"),
        description: t("clinic.invoices.emailError"),
        variant: "destructive",
      });
    } finally {
      setIsEmailSending(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setShowEmailForm(false);
      setEmailAddress("");
      setSaveEmailToPatient(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("clinic.invoices.invoice")} #{invoiceWithItems?.invoiceNumber}
          </DialogTitle>
        </DialogHeader>
        {invoiceWithItems && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("clinic.invoices.customer")}
                </p>
                <p className="font-medium">{invoiceWithItems.customerName}</p>
                {invoiceWithItems.customerAddress && (
                  <p className="text-sm whitespace-pre-line">
                    {invoiceWithItems.customerAddress}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("clinic.invoices.date")}
                </p>
                <p className="font-medium">
                  {format(new Date(invoiceWithItems.date), "PP", {
                    locale: dateLocale,
                  })}
                </p>
              </div>
            </div>

            {invoiceWithItems.items && invoiceWithItems.items.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  {t("clinic.invoices.lineItems")}
                </p>
                <div className="space-y-2">
                  {invoiceWithItems.items.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex justify-between text-sm bg-muted/50 p-2 rounded"
                      data-testid={`invoice-item-${index}`}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{item.description}</div>
                        {(item.pharmacode || item.gtin) && (
                          <div className="text-xs text-muted-foreground">
                            {item.pharmacode && (
                              <span>Pharmacode: {item.pharmacode}</span>
                            )}
                            {item.pharmacode && item.gtin && <span> | </span>}
                            {item.gtin && <span>GTIN: {item.gtin}</span>}
                          </div>
                        )}
                        <span className="text-muted-foreground">
                          x{item.quantity}
                        </span>
                      </div>
                      <span>{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <div className="flex justify-between text-sm">
                <span>{t("clinic.invoices.subtotal")}</span>
                <span>{formatCurrency(invoiceWithItems.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>
                  {t("clinic.invoices.vat")} ({invoiceWithItems.vatRate}%)
                </span>
                <span>{formatCurrency(invoiceWithItems.vatAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t mt-2 pt-2">
                <span>{t("clinic.invoices.total")}</span>
                <span>{formatCurrency(invoiceWithItems.total)}</span>
              </div>
            </div>

            {invoiceWithItems.comments && (
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  {t("clinic.invoices.comments")}
                </p>
                <p className="text-sm">{invoiceWithItems.comments}</p>
              </div>
            )}

            {showEmailForm ? (
              <div className="border-t pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-input">
                    {t("clinic.invoices.emailAddress")}
                  </Label>
                  <Input
                    id="email-input"
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder={t("clinic.invoices.enterEmail")}
                    data-testid="input-email-address"
                  />
                  {patientEmail && (
                    <p className="text-xs text-muted-foreground">
                      {t("clinic.invoices.currentPatientEmail")}: {patientEmail}
                    </p>
                  )}
                </div>

                {emailAddress &&
                  emailAddress !== patientEmail &&
                  invoiceWithItems.patientId && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="save-email"
                        checked={saveEmailToPatient}
                        onCheckedChange={(checked) =>
                          setSaveEmailToPatient(checked === true)
                        }
                        data-testid="checkbox-save-email"
                      />
                      <Label htmlFor="save-email" className="text-sm">
                        {t("clinic.invoices.saveEmailToPatient")}
                      </Label>
                    </div>
                  )}

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setShowEmailForm(false)}
                    data-testid="button-cancel-email"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={handleSendEmail}
                    disabled={!emailAddress || isEmailSending}
                    data-testid="button-send-email"
                  >
                    {isEmailSending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t("common.sending")}
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        {t("clinic.invoices.sendEmail")}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t pt-4 flex gap-2">
                {invoiceWithItems.status === "draft" && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm(t("clinic.invoices.confirmDelete", "Delete this invoice?"))) {
                        deleteMutation.mutate();
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-invoice-dialog"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t("common.delete", "Delete")}
                  </Button>
                )}
                <div className="flex gap-2 ml-auto">
                {invoiceWithItems.status === "draft" && (
                  <Button
                    variant="outline"
                    onClick={() => markPaidMutation.mutate()}
                    disabled={markPaidMutation.isPending}
                    data-testid="button-mark-paid-dialog"
                  >
                    <Check className="h-4 w-4 mr-2 text-green-600" />
                    {t("clinic.invoices.markAsPaid", "Mark as Paid")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowEmailForm(true)}
                  disabled={!invoiceWithItems}
                  data-testid="button-show-email-form"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {t("clinic.invoices.sendViaEmail")}
                </Button>
                <Button
                  onClick={generateInvoicePDF}
                  disabled={isPdfLoading || !invoiceWithItems}
                  data-testid="button-download-pdf"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isPdfLoading
                    ? t("common.loading")
                    : t("clinic.invoices.downloadPdf")}
                </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
