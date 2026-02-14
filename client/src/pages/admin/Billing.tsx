import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import SignaturePad from "@/components/SignaturePad";
import { TermsOfUseContent } from "@/components/TermsOfUseContent";
import { PrivacyPolicyContent } from "@/components/PrivacyPolicyContent";
import { AVVContent } from "@/components/AVVContent";
import { 
  CreditCard, 
  ExternalLink, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Trash2,
  Download,
  FileSignature,
  Pen,
  Calculator,
  Phone,
  Camera,
  Clock,
  ClipboardList,
  ChevronDown,
  Scissors,
  Truck,
  Building2,
  Timer
} from "lucide-react";

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY 
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

interface BillingStatus {
  licenseType: string;
  hasPaymentMethod: boolean;
  stripeCustomerId: string | null;
  paymentMethod: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  pricePerRecord: number;
  currentMonthRecords: number;
  estimatedCost: number;
  billingRequired: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  trialExpired: boolean;
  addons: {
    questionnaire: boolean;
    dispocura: boolean;
    retell: boolean;
    monitor: boolean;
    surgery: boolean;
    worktime: boolean;
    logistics: boolean;
    clinic: boolean;
  };
}

interface Invoice {
  id: string;
  hospitalId: string;
  periodStart: string;
  periodEnd: string;
  recordCount: number;
  basePrice: string;
  questionnairePrice: string;
  dispocuraPrice: string;
  retellPrice: string;
  monitorPrice: string;
  surgeryPrice: string;
  worktimePrice: string;
  logisticsPrice: string;
  clinicPrice: string;
  totalAmount: string;
  currency: string;
  stripeInvoiceId: string | null;
  stripeInvoiceUrl: string | null;
  stripePaymentIntentId: string | null;
  status: string;
  paidAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface DocumentAcceptance {
  id: string;
  signedAt: string;
  signedByName: string;
  signedByEmail: string;
  countersignedAt: string | null;
  countersignedByName: string | null;
  hasPdf: boolean;
}

interface DocumentStatus {
  hasAccepted: boolean;
  acceptance: DocumentAcceptance | null;
}

type LegalDocumentType = "terms" | "privacy" | "avv";

interface TermsStatus {
  hasAccepted: boolean;
  currentVersion: string;
  documents: Record<LegalDocumentType, DocumentStatus>;
  documentTypes: LegalDocumentType[];
  documentLabels: Record<LegalDocumentType, { de: string; en: string }>;
  acceptance: DocumentAcceptance | null;
}

function CardSetupForm({ hospitalId, onSuccess }: { hospitalId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest("POST", `/api/billing/${hospitalId}/setup-intent`);
      const { clientSecret } = await response.json();

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }

      const { setupIntent, error: stripeError } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (setupIntent?.payment_method) {
        await apiRequest("POST", `/api/billing/${hospitalId}/confirm-setup`, {
          paymentMethodId: setupIntent.payment_method,
        });

        toast({ title: "Payment method saved successfully" });
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || "Failed to save payment method");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg bg-background">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "16px",
                color: "#424770",
                "::placeholder": {
                  color: "#aab7c4",
                },
              },
              invalid: {
                color: "#9e2146",
              },
            },
          }}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={!stripe || isLoading} className="w-full">
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Payment Method
      </Button>
    </form>
  );
}

function BillingContent({ hospitalId }: { hospitalId: string }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardFormAutoShown, setCardFormAutoShown] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [expandedDocuments, setExpandedDocuments] = useState<Record<LegalDocumentType, boolean>>({
    terms: false,
    privacy: false,
    avv: false,
  });
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [activeDocumentType, setActiveDocumentType] = useState<LegalDocumentType>("terms");
  const isGerman = i18n.language === "de";
  
  const DOCUMENT_LABELS: Record<LegalDocumentType, { de: string; en: string }> = {
    terms: { de: "Nutzungsbedingungen", en: "Terms of Service" },
    privacy: { de: "Datenschutzerklärung", en: "Privacy Policy" },
    avv: { de: "Auftragsverarbeitungsvertrag (AVV)", en: "Data Processing Agreement" },
  };

  const { data: billingStatus, isLoading: statusLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing", hospitalId, "status"],
    queryFn: async () => {
      const res = await fetch(`/api/billing/${hospitalId}/status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch billing status");
      return res.json();
    },
  });

  const { data: termsStatus, isLoading: termsLoading } = useQuery<TermsStatus>({
    queryKey: ["/api/billing", hospitalId, "terms-status"],
    queryFn: async () => {
      const res = await fetch(`/api/billing/${hospitalId}/terms-status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch terms status");
      return res.json();
    },
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["/api/billing", hospitalId, "billing-invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/billing/${hospitalId}/billing-invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });

  useEffect(() => {
    if (billingStatus?.billingRequired && !billingStatus?.paymentMethod && !cardFormAutoShown) {
      setShowCardForm(true);
      setCardFormAutoShown(true);
    }
  }, [billingStatus, cardFormAutoShown]);

  const acceptTermsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/billing/${hospitalId}/accept-terms`, {
        signatureImage,
        signerName,
        language: i18n.language,
        documentType: activeDocumentType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing", hospitalId, "terms-status"] });
      setShowTermsDialog(false);
      setTermsAccepted(false);
      setSignerName("");
      setSignatureImage(null);
      const docLabel = DOCUMENT_LABELS[activeDocumentType];
      toast({
        title: t('billing.documentAccepted', { document: isGerman ? docLabel.de : docLabel.en }),
        description: data.emailSent
          ? t('billing.copySentForCountersigning')
          : undefined,
      });
    },
    onError: () => {
      const docLabel = DOCUMENT_LABELS[activeDocumentType];
      toast({
        title: t('billing.failedToAccept', { document: isGerman ? docLabel.de : docLabel.en }),
        variant: "destructive"
      });
    },
  });

  const removePaymentMethod = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/billing/${hospitalId}/payment-method`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing", hospitalId] });
      toast({ title: "Payment method removed" });
    },
  });

  const openBillingPortal = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/billing/${hospitalId}/portal-session`);
      return response.json();
    },
    onSuccess: (data) => {
      window.open(data.url, "_blank");
    },
    onError: () => {
      toast({ title: "Failed to open billing portal", variant: "destructive" });
    },
  });

  const toggleAddon = useMutation({
    mutationFn: async ({ addon, enabled }: { addon: string; enabled: boolean }) => {
      return apiRequest("PATCH", `/api/billing/${hospitalId}/addons`, { addon, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing", hospitalId, "status"] });
    },
    onError: () => {
      toast({ title: t('billing.failedToUpdateAddon'), variant: "destructive" });
    },
  });

  const generateInvoice = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/billing/${hospitalId}/generate-invoice`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing", hospitalId, "billing-invoices"] });
      toast({
        title: t('billing.invoiceGenerated'),
        description: `${data.invoice?.recordCount || 0} ${t('billing.records')} - CHF ${data.invoice?.totalAmount || '0.00'}`
      });
    },
    onError: (error: any) => {
      toast({
        title: t('billing.failedToGenerateInvoice'),
        description: error.message,
        variant: "destructive"
      });
    },
  });

  if (statusLoading || termsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!billingStatus) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load billing information</AlertDescription>
      </Alert>
    );
  }

  const hasAcceptedTerms = termsStatus?.hasAccepted ?? false;
  const canSetupPayment = hasAcceptedTerms || billingStatus.licenseType === "free";

  return (
    <div className="space-y-6">
      {billingStatus.licenseType === "free" ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            {t('billing.freePlanMessage')}
          </AlertDescription>
        </Alert>
      ) : billingStatus.licenseType === "test" && !billingStatus.trialExpired ? (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            {t('billing.trialMessage', { days: billingStatus.trialDaysRemaining })}
          </AlertDescription>
        </Alert>
      ) : billingStatus.billingRequired ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {billingStatus.licenseType === "test" && billingStatus.trialExpired
              ? t('billing.trialExpiredMessage')
              : t('billing.addPaymentMethodMessage')}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Pricing Overview Card */}
      {billingStatus.licenseType !== "free" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              {t('billing.pricingOverview')}
            </CardTitle>
            <CardDescription>
              {t('billing.pricingDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Base Fee */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">{t('billing.baseFee')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('billing.baseFeeDescription')}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-lg font-bold">3.00 CHF</Badge>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                {t('billing.optionalAddons')}
              </p>

              {/* Camera Monitor Connection */}
              <div className="flex items-center justify-between p-3 border rounded-lg opacity-75">
                <div className="flex items-center gap-3">
                  <Camera className="h-5 w-5 text-orange-500" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{t('billing.addon.monitorCamera')}</p>
                      <Badge variant="outline" className="text-xs">
                        {t('billing.perRecord')}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {t('billing.comingSoon')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('billing.addon.monitorCameraDesc')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">+1.00 CHF</span>
                  <Switch 
                    checked={billingStatus.addons.monitor}
                    onCheckedChange={(checked) => toggleAddon.mutate({ addon: "monitor", enabled: checked })}
                    disabled={true}
                    data-testid="switch-addon-monitor"
                  />
                </div>
              </div>

              {/* Work Time Logs */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Timer className="h-5 w-5 text-indigo-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{t('billing.addon.workTimeLogs')}</p>
                      <Badge variant="outline" className="text-xs">
                        {t('billing.monthly')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('billing.addon.workTimeLogsDesc')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">+5.00 CHF/Mt.</span>
                  <Switch 
                    checked={billingStatus.addons.worktime}
                    onCheckedChange={(checked) => toggleAddon.mutate({ addon: "worktime", enabled: checked })}
                    disabled={toggleAddon.isPending}
                    data-testid="switch-addon-worktime"
                  />
                </div>
              </div>

              {/* Dispocura Integration */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Calculator className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Dispocura</p>
                      <Badge variant="outline" className="text-xs">
                        {t('billing.perRecord')}
                      </Badge>
                    </div>
                    <p className="text-sm font-bold">
                      {t('billing.addon.dispocuraRequires')} <a href="https://www.galexis.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Galexis</a>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('billing.addon.dispocuraDesc')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">+1.00 CHF</span>
                  <Switch 
                    checked={billingStatus.addons.dispocura}
                    onCheckedChange={(checked) => toggleAddon.mutate({ addon: "dispocura", enabled: checked })}
                    disabled={toggleAddon.isPending}
                    data-testid="switch-addon-dispocura"
                  />
                </div>
              </div>

              {/* Logistics Module */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-orange-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{t('billing.addon.logistics')}</p>
                      <Badge variant="outline" className="text-xs">
                        {t('billing.monthly')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('billing.addon.logisticsDesc')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">+5.00 CHF/Mt.</span>
                  <Switch 
                    checked={billingStatus.addons.logistics}
                    onCheckedChange={(checked) => toggleAddon.mutate({ addon: "logistics", enabled: checked })}
                    disabled={toggleAddon.isPending}
                    data-testid="switch-addon-logistics"
                  />
                </div>
              </div>

              {/* Clinic Module */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-emerald-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{t('billing.addon.clinic')}</p>
                      <Badge variant="outline" className="text-xs">
                        {t('billing.monthly')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('billing.addon.clinicDesc')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">+10.00 CHF/Mt.</span>
                  <Switch 
                    checked={billingStatus.addons.clinic}
                    onCheckedChange={(checked) => toggleAddon.mutate({ addon: "clinic", enabled: checked })}
                    disabled={toggleAddon.isPending}
                    data-testid="switch-addon-clinic"
                  />
                </div>
              </div>

              {/* Retell.ai Phone Booking - Monthly */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Retell.ai</p>
                      <Badge variant="outline" className="text-xs">
                        {t('billing.monthly')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('billing.addon.retellDesc')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">+15.00 CHF/Mt.</span>
                  <Switch 
                    checked={billingStatus.addons.retell}
                    onCheckedChange={(checked) => toggleAddon.mutate({ addon: "retell", enabled: checked })}
                    disabled={toggleAddon.isPending}
                    data-testid="switch-addon-retell"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Total Calculation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                <p className="font-medium">
                  {t('billing.totalPerRecord')}
                </p>
                <p className="text-xl font-bold text-primary">
                  {(3 + 
                    (billingStatus.addons.dispocura ? 1 : 0) + 
                    (billingStatus.addons.monitor ? 1 : 0)
                  ).toFixed(2)} CHF
                </p>
              </div>
              {(billingStatus.addons.worktime || billingStatus.addons.logistics || billingStatus.addons.clinic || billingStatus.addons.retell) && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium text-muted-foreground">
                    {t('billing.additionalMonthly')}
                  </p>
                  <p className="text-lg font-semibold text-muted-foreground">
                    +{(
                      (billingStatus.addons.worktime ? 5 : 0) +
                      (billingStatus.addons.logistics ? 5 : 0) +
                      (billingStatus.addons.clinic ? 10 : 0) +
                      (billingStatus.addons.retell ? 15 : 0)
                    ).toFixed(2)} CHF
                  </p>
                </div>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              {t('billing.pricesNetVat')}
            </p>
          </CardContent>
        </Card>
      )}

      {billingStatus.licenseType !== "free" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              {t('billing.legalDocuments')}
            </CardTitle>
            <CardDescription>
              {t('billing.legalDocumentsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview PDF Downloads for WhatsApp sharing */}
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-3">
                {t('billing.downloadPreviewPdfs')}
              </p>
              <div className="flex flex-wrap gap-2">
                {(["terms", "privacy", "avv"] as const).map((docType) => {
                  const docLabel = DOCUMENT_LABELS[docType];
                  return (
                    <Button
                      key={docType}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.open(`/api/billing/preview-pdf/${docType}?lang=${isGerman ? "de" : "en"}`, "_blank");
                      }}
                      data-testid={`button-preview-${docType}`}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {docType === "terms" ? t('billing.doc.terms') :
                       docType === "privacy" ? t('billing.doc.privacy') :
                       t('billing.doc.avv')}
                    </Button>
                  );
                })}
              </div>
            </div>
            
            {!hasAcceptedTerms && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('billing.signAllDocumentsFirst')}
                </AlertDescription>
              </Alert>
            )}
            
            {(["terms", "privacy", "avv"] as const).map((docType) => {
              const docStatus = termsStatus?.documents?.[docType];
              const docLabel = DOCUMENT_LABELS[docType];
              const isDocAccepted = docStatus?.hasAccepted ?? false;
              const acceptance = docStatus?.acceptance;
              const isExpanded = expandedDocuments[docType];
              
              const getDocumentContent = () => {
                switch (docType) {
                  case "terms": return <TermsOfUseContent />;
                  case "privacy": return <PrivacyPolicyContent />;
                  case "avv": return <AVVContent />;
                }
              };
              
              return (
                <div key={docType} className="border rounded-lg overflow-hidden">
                  {isDocAccepted ? (
                    <div className="space-y-0">
                      <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20">
                        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-green-800 dark:text-green-200">
                            {isGerman ? docLabel.de : docLabel.en}
                          </p>
                          {acceptance && (
                            <p className="text-sm text-muted-foreground truncate">
                              {t('billing.signedBy')} {acceptance.signedByName}{" "}
                              {t('billing.on')} {new Date(acceptance.signedAt).toLocaleDateString(isGerman ? "de-DE" : "en-US")}
                            </p>
                          )}
                        </div>
                        {acceptance?.id && (
                          acceptance?.hasPdf ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                window.open(`/api/billing/${hospitalId}/terms-pdf/${acceptance.id}`, "_blank");
                              }}
                              data-testid={`button-download-${docType}-pdf`}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              PDF
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  const res = await apiRequest("POST", `/api/billing/${hospitalId}/regenerate-pdf/${acceptance.id}`);
                                  if (res.ok) {
                                    queryClient.invalidateQueries({ queryKey: ["/api/billing", hospitalId, "terms-status"] });
                                    toast({
                                      title: t('billing.pdfGenerated'),
                                      description: t('billing.pdfGeneratedDesc'),
                                    });
                                  }
                                } catch (error) {
                                  toast({
                                    title: t('common.error'),
                                    description: t('billing.failedToGeneratePdf'),
                                    variant: "destructive",
                                  });
                                }
                              }}
                              data-testid={`button-generate-${docType}-pdf`}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              {t('billing.generatePdf')}
                            </Button>
                          )
                        )}
                      </div>
                      
                      <Collapsible 
                        open={isExpanded} 
                        onOpenChange={(open) => setExpandedDocuments(prev => ({ ...prev, [docType]: open }))}
                      >
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between rounded-none border-t" data-testid={`button-expand-${docType}`}>
                            <span>{t('billing.viewDocument', { document: isGerman ? docLabel.de : docLabel.en })}</span>
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-4 bg-muted/30 max-h-96 overflow-y-auto border-t">
                            {getDocumentContent()}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  ) : (
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium">{isGerman ? docLabel.de : docLabel.en}</p>
                          <p className="text-sm text-muted-foreground">
                            {t('billing.notYetSigned')}
                          </p>
                        </div>
                      </div>
                      <Button 
                        onClick={() => {
                          setActiveDocumentType(docType);
                          setShowTermsDialog(true);
                        }} 
                        className="w-full"
                        data-testid={`button-sign-${docType}`}
                      >
                        <FileSignature className="mr-2 h-4 w-4" />
                        {t('billing.readAndSign', { document: isGerman ? docLabel.de : docLabel.en })}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              {isGerman ? DOCUMENT_LABELS[activeDocumentType].de : DOCUMENT_LABELS[activeDocumentType].en} - Viali.app
            </DialogTitle>
            <DialogDescription>
              {t('billing.readDocumentCarefully')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {activeDocumentType === "terms" && <TermsOfUseContent />}
            {activeDocumentType === "privacy" && <PrivacyPolicyContent />}
            {activeDocumentType === "avv" && <AVVContent />}
            
            <Separator />
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox 
                  id="accept-terms"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                  data-testid="checkbox-accept-terms"
                />
                <Label htmlFor="accept-terms" className="text-sm leading-relaxed">
                  {t('billing.acceptOnBehalf', { document: isGerman ? DOCUMENT_LABELS[activeDocumentType].de : DOCUMENT_LABELS[activeDocumentType].en })}
                </Label>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signer-name">
                  {t('billing.fullName')}
                </Label>
                <Input 
                  id="signer-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder={t('billing.fullNamePlaceholder')}
                  data-testid="input-signer-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>{t('billing.signature')}</Label>
                {signatureImage ? (
                  <div className="space-y-2">
                    <div className="border rounded-lg p-2 bg-white">
                      <img src={signatureImage} alt="Signature" className="h-16 mx-auto" />
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setSignatureImage(null)}
                      data-testid="button-clear-signature"
                    >
                      {t('billing.clearSignature')}
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={() => setShowSignaturePad(true)}
                    className="w-full"
                    data-testid="button-add-signature"
                  >
                    <Pen className="mr-2 h-4 w-4" />
                    {t('billing.addSignature')}
                  </Button>
                )}
              </div>
              
              <div className="text-sm text-muted-foreground">
                {t('billing.date')}: {new Date().toLocaleDateString(isGerman ? "de-DE" : "en-US")}
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowTermsDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={() => acceptTermsMutation.mutate()}
              disabled={!termsAccepted || !signerName.trim() || !signatureImage || acceptTermsMutation.isPending}
              data-testid="button-submit-terms"
            >
              {acceptTermsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('billing.acceptAndSign')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <SignaturePad 
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onSave={(sig) => {
          setSignatureImage(sig);
          setShowSignaturePad(false);
        }}
        title={t('billing.yourSignature')}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className={!canSetupPayment ? "opacity-60" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('billing.paymentMethod')}
            </CardTitle>
            <CardDescription>
              {t('billing.paymentMethodDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canSetupPayment ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('billing.acceptTermsFirst')}
                </AlertDescription>
              </Alert>
            ) : billingStatus.paymentMethod ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium capitalize">
                        {billingStatus.paymentMethod.brand} •••• {billingStatus.paymentMethod.last4}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Expires {billingStatus.paymentMethod.expMonth}/{billingStatus.paymentMethod.expYear}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePaymentMethod.mutate()}
                    disabled={removePaymentMethod.isPending}
                  >
                    {removePaymentMethod.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowCardForm(true)}
                >
                  Update Payment Method
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {!showCardForm ? (
                  <Button onClick={() => setShowCardForm(true)} className="w-full">
                    Add Payment Method
                  </Button>
                ) : stripePromise ? (
                  <Elements stripe={stripePromise}>
                    <CardSetupForm
                      hospitalId={hospitalId}
                      onSuccess={() => {
                        setShowCardForm(false);
                        queryClient.invalidateQueries({ queryKey: ["/api/billing", hospitalId] });
                      }}
                    />
                  </Elements>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Stripe is not configured. Please contact support.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {showCardForm && billingStatus.paymentMethod && stripePromise && (
              <div className="mt-4">
                <Separator className="mb-4" />
                <Elements stripe={stripePromise}>
                  <CardSetupForm
                    hospitalId={hospitalId}
                    onSuccess={() => {
                      setShowCardForm(false);
                      queryClient.invalidateQueries({ queryKey: ["/api/billing", hospitalId] });
                    }}
                  />
                </Elements>
                <Button
                  variant="ghost"
                  className="w-full mt-2"
                  onClick={() => setShowCardForm(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Usage</CardTitle>
            <CardDescription>This month's anesthesia records</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Plan</span>
                <Badge variant={billingStatus.licenseType === "free" ? "secondary" : billingStatus.licenseType === "test" ? "outline" : "default"}>
                  {billingStatus.licenseType === "free" ? "Free" : 
                   billingStatus.licenseType === "test" ? (billingStatus.trialExpired ? "Trial Expired" : `Trial (${billingStatus.trialDaysRemaining}d)`) : 
                   "Basic"}
                </Badge>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Records this month</span>
                <span className="font-medium">{billingStatus.currentMonthRecords}</span>
              </div>
              {billingStatus.licenseType !== "free" && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Price per record</span>
                    <span className="font-medium">
                      CHF {billingStatus.pricePerRecord?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Estimated cost</span>
                    <span className="font-bold text-lg">
                      CHF {billingStatus.estimatedCost?.toFixed(2) || "0.00"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("billing.invoices", "Invoices")}
              </CardTitle>
              <CardDescription>{t("billing.invoicesDescription", "View and download your invoices")}</CardDescription>
            </div>
            <div className="flex gap-2">
              {billingStatus.stripeCustomerId && billingStatus.hasPaymentMethod && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateInvoice.mutate()}
                  disabled={generateInvoice.isPending}
                  data-testid="button-generate-invoice"
                >
                  {generateInvoice.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Calculator className="mr-2 h-4 w-4" />
                  )}
                  {t('billing.generateInvoice')}
                </Button>
              )}
              {billingStatus.stripeCustomerId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openBillingPortal.mutate()}
                  disabled={openBillingPortal.isPending}
                >
                  {openBillingPortal.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Manage in Stripe
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoicesData?.invoices && invoicesData.invoices.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {invoicesData.invoices.map((invoice) => {
                  const periodStart = new Date(invoice.periodStart);
                  const periodLabel = periodStart.toLocaleDateString(isGerman ? 'de-CH' : 'en-US', { 
                    month: 'long', 
                    year: 'numeric' 
                  });
                  
                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                      data-testid={`invoice-row-${invoice.id}`}
                    >
                      <div>
                        <p className="font-medium">{periodLabel}</p>
                        <p className="text-sm text-muted-foreground">
                          {invoice.recordCount} {t('billing.records')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            invoice.status === "paid"
                              ? "default"
                              : invoice.status === "pending"
                              ? "secondary"
                              : invoice.status === "failed"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {invoice.status === "paid" ? t('billing.status.paid') :
                           invoice.status === "pending" ? t('billing.status.pending') :
                           invoice.status === "failed" ? t('billing.status.failed') :
                           invoice.status}
                        </Badge>
                        <span className="font-medium">
                          {invoice.currency.toUpperCase()} {parseFloat(invoice.totalAmount).toFixed(2)}
                        </span>
                        {invoice.stripeInvoiceUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(invoice.stripeInvoiceUrl!, "_blank")}
                            data-testid={`button-view-invoice-${invoice.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No invoices yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Billing() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();

  if (!activeHospital?.id) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("billing.selectHospital", "Please select a hospital to view billing")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("billing.title", "Billing")}</h1>
        <p className="text-muted-foreground">{t("billing.description", "Manage your subscription and payment methods")}</p>
      </div>
      <BillingContent hospitalId={activeHospital.id} />
    </div>
  );
}
