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

interface TermsStatus {
  hasAccepted: boolean;
  currentVersion: string;
  acceptance: {
    id: string;
    signedAt: string;
    signedByName: string;
    signedByEmail: string;
    countersignedAt: string | null;
    countersignedByName: string | null;
    hasPdf: boolean;
  } | null;
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
  const [termsExpanded, setTermsExpanded] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const isGerman = i18n.language === "de";

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
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing", hospitalId, "terms-status"] });
      setShowTermsDialog(false);
      setTermsAccepted(false);
      setSignerName("");
      setSignatureImage(null);
      toast({ 
        title: isGerman ? "Nutzungsbedingungen akzeptiert" : "Terms of Use accepted",
        description: data.emailSent 
          ? (isGerman ? "Eine Kopie wurde zur Gegenzeichnung gesendet" : "A copy has been sent for countersigning")
          : undefined,
      });
    },
    onError: () => {
      toast({ 
        title: isGerman ? "Fehler beim Akzeptieren" : "Failed to accept terms", 
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
      toast({ title: isGerman ? "Fehler beim Aktualisieren" : "Failed to update add-on", variant: "destructive" });
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
        title: isGerman ? "Rechnung erstellt" : "Invoice Generated", 
        description: `${data.invoice?.recordCount || 0} ${isGerman ? 'Datensätze' : 'records'} - CHF ${data.invoice?.totalAmount || '0.00'}` 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: isGerman ? "Fehler beim Erstellen der Rechnung" : "Failed to generate invoice", 
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
            {isGerman 
              ? <>Ihre Klinik nutzt den <strong>Free Plan</strong>. Keine Zahlung erforderlich.</>
              : <>Your clinic is on the <strong>Free Plan</strong>. No payment required.</>}
          </AlertDescription>
        </Alert>
      ) : billingStatus.licenseType === "test" && !billingStatus.trialExpired ? (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            {isGerman 
              ? <>Sie haben noch <strong>{billingStatus.trialDaysRemaining} Tag(e)</strong> in Ihrer Testphase. Alle Funktionen sind während der Testphase verfügbar.</>
              : <>You have <strong>{billingStatus.trialDaysRemaining} day(s)</strong> remaining in your trial. All features are available during your trial period.</>}
          </AlertDescription>
        </Alert>
      ) : billingStatus.billingRequired ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {billingStatus.licenseType === "test" && billingStatus.trialExpired 
              ? (isGerman 
                  ? "Ihre Testphase ist abgelaufen. Bitte fügen Sie eine Zahlungsmethode hinzu, um die App weiter nutzen zu können."
                  : "Your trial has expired. Please add a payment method to continue using the app.")
              : (isGerman 
                  ? "Bitte fügen Sie eine Zahlungsmethode hinzu, um die App weiter nutzen zu können."
                  : "Please add a payment method to continue using the app.")}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Pricing Overview Card */}
      {billingStatus.licenseType !== "free" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              {isGerman ? "Preisübersicht" : "Pricing Overview"}
            </CardTitle>
            <CardDescription>
              {isGerman 
                ? "Basisgebühr und optionale Zusatzmodule pro Anästhesie-Protokoll"
                : "Base fee and optional add-on modules per anesthesia record"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Base Fee */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">{isGerman ? "Basisgebühr" : "Base Fee"}</p>
                  <p className="text-sm text-muted-foreground">
                    {isGerman ? "Anästhesie-Protokolle, Inventar, Cloud-Hosting" : "Anesthesia records, inventory, cloud hosting"}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-lg font-bold">3.00 CHF</Badge>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                {isGerman ? "Optionale Zusatzmodule" : "Optional Add-ons"}
              </p>

              {/* Patient Questionnaires */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-purple-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{isGerman ? "Patientenfragebögen" : "Patient Questionnaires"}</p>
                      <Badge variant="outline" className="text-xs">
                        {isGerman ? "Pro Protokoll" : "Per record"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isGerman ? "Online Vor-OP Fragebögen für Patienten" : "Online pre-operative questionnaires for patients"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">+1.00 CHF</span>
                  <Switch 
                    checked={billingStatus.addons.questionnaire}
                    onCheckedChange={(checked) => toggleAddon.mutate({ addon: "questionnaire", enabled: checked })}
                    disabled={toggleAddon.isPending}
                    data-testid="switch-addon-questionnaire"
                  />
                </div>
              </div>

              {/* Surgery Module */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Scissors className="h-5 w-5 text-teal-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{isGerman ? "Chirurgie-Modul" : "Surgery Module"}</p>
                      <Badge variant="outline" className="text-xs">
                        {isGerman ? "Pro Protokoll" : "Per record"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isGerman ? "OP-Dokumentation für Chirurgie" : "OR documentation for surgery"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">+1.00 CHF</span>
                  <Switch 
                    checked={billingStatus.addons.surgery}
                    onCheckedChange={(checked) => toggleAddon.mutate({ addon: "surgery", enabled: checked })}
                    disabled={toggleAddon.isPending}
                    data-testid="switch-addon-surgery"
                  />
                </div>
              </div>

              {/* Work Time Logs */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Timer className="h-5 w-5 text-indigo-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{isGerman ? "Arbeitszeitnachweise" : "Work Time Logs"}</p>
                      <Badge variant="outline" className="text-xs">
                        {isGerman ? "Monatlich" : "Monthly"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isGerman ? "Externe Arbeitszeiterfassung & Dokumentation" : "External work time tracking & documentation"}
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
                        {isGerman ? "Pro Protokoll" : "Per record"}
                      </Badge>
                    </div>
                    <p className="text-sm font-bold">
                      {isGerman 
                        ? <>Erfordert <a href="https://www.galexis.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Galexis</a> Kundenkonto</>
                        : <>Requires <a href="https://www.galexis.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Galexis</a> Customer account</>
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isGerman ? "Automatische OP-Kostenberechnung und Statistiken" : "Automatic surgery cost calculation and statistics"}
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

              {/* Camera Monitor Connection */}
              <div className="flex items-center justify-between p-3 border rounded-lg opacity-75">
                <div className="flex items-center gap-3">
                  <Camera className="h-5 w-5 text-orange-500" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{isGerman ? "Monitor-Kamera" : "Monitor Camera"}</p>
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {isGerman ? "In Entwicklung" : "Coming soon"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isGerman ? "Automatische Vitaldaten via Kamera" : "Automatic vital data via camera"}
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

              {/* Logistics Module */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-orange-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{isGerman ? "Logistik-Modul" : "Logistics Module"}</p>
                      <Badge variant="outline" className="text-xs">
                        {isGerman ? "Monatlich" : "Monthly"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isGerman ? "Zentrales Bestellmanagementsystem" : "Centralized order management system"}
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
                      <p className="font-medium">{isGerman ? "Klinik-Modul" : "Clinic Module"}</p>
                      <Badge variant="outline" className="text-xs">
                        {isGerman ? "Monatlich" : "Monthly"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isGerman ? "Ambulante Rechnungen & Terminverwaltung" : "Outpatient invoices & appointment management"}
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
                        {isGerman ? "Monatlich" : "Monthly"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isGerman ? "Automatisches Telefon-Buchungssystem" : "Automatic phone booking system"}
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
                  {isGerman ? "Gesamt pro Protokoll" : "Total per Record"}
                </p>
                <p className="text-xl font-bold text-primary">
                  {(3 + 
                    (billingStatus.addons.questionnaire ? 1 : 0) +
                    (billingStatus.addons.dispocura ? 1 : 0) + 
                    (billingStatus.addons.monitor ? 1 : 0) +
                    (billingStatus.addons.surgery ? 1 : 0)
                  ).toFixed(2)} CHF
                </p>
              </div>
              {(billingStatus.addons.worktime || billingStatus.addons.logistics || billingStatus.addons.clinic || billingStatus.addons.retell) && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium text-muted-foreground">
                    {isGerman ? "Zusätzlich monatlich" : "Additional Monthly"}
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
              {isGerman 
                ? "Alle Preise verstehen sich netto. MwSt. kann bei der Zahlung anfallen."
                : "All prices are net. VAT may apply on payment."}
            </p>
          </CardContent>
        </Card>
      )}

      {billingStatus.licenseType !== "free" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              {isGerman ? "Nutzungsbedingungen" : "Terms of Use"}
            </CardTitle>
            <CardDescription>
              {isGerman 
                ? "Akzeptieren Sie die Nutzungsbedingungen, um die Zahlungseinrichtung zu aktivieren"
                : "Accept the terms of use to enable payment setup"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasAcceptedTerms ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800 dark:text-green-200">
                      {isGerman ? "Nutzungsbedingungen akzeptiert" : "Terms of Use Accepted"}
                    </p>
                    {termsStatus?.acceptance && (
                      <p className="text-sm text-muted-foreground">
                        {isGerman ? "Unterzeichnet von" : "Signed by"} {termsStatus.acceptance.signedByName}{" "}
                        {isGerman ? "am" : "on"} {new Date(termsStatus.acceptance.signedAt).toLocaleDateString(isGerman ? "de-DE" : "en-US")}
                      </p>
                    )}
                  </div>
                  {termsStatus?.acceptance?.hasPdf && termsStatus.acceptance?.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        window.open(`/api/billing/${hospitalId}/terms-pdf/${termsStatus.acceptance!.id}`, "_blank");
                      }}
                      data-testid="button-download-terms-pdf"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  )}
                </div>
                
                <Collapsible open={termsExpanded} onOpenChange={setTermsExpanded}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between" data-testid="button-expand-terms">
                      <span>{isGerman ? "Nutzungsbedingungen anzeigen" : "View Terms of Use"}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${termsExpanded ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="border rounded-lg p-4 bg-muted/30 max-h-96 overflow-y-auto">
                      <TermsOfUseContent />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {isGerman 
                      ? "Bitte lesen und akzeptieren Sie die Nutzungsbedingungen, bevor Sie eine Zahlungsmethode einrichten."
                      : "Please read and accept the terms of use before setting up a payment method."}
                  </AlertDescription>
                </Alert>
                <Button 
                  onClick={() => setShowTermsDialog(true)} 
                  className="w-full"
                  data-testid="button-open-terms"
                >
                  <FileSignature className="mr-2 h-4 w-4" />
                  {isGerman ? "Nutzungsbedingungen lesen & akzeptieren" : "Read & Accept Terms of Use"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              {isGerman ? "Nutzungsbedingungen - Viali.app" : "Terms of Use - Viali.app"}
            </DialogTitle>
            <DialogDescription>
              {isGerman 
                ? "Bitte lesen Sie die Nutzungsbedingungen sorgfältig durch und unterschreiben Sie zur Bestätigung."
                : "Please read the terms of use carefully and sign to confirm your acceptance."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <TermsOfUseContent />
            
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
                  {isGerman 
                    ? "Ich habe die Nutzungsbedingungen gelesen und akzeptiere sie im Namen meiner Klinik."
                    : "I have read and accept the terms of use on behalf of my clinic."}
                </Label>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signer-name">
                  {isGerman ? "Vollständiger Name" : "Full Name"}
                </Label>
                <Input 
                  id="signer-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder={isGerman ? "Max Mustermann" : "John Doe"}
                  data-testid="input-signer-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>{isGerman ? "Unterschrift" : "Signature"}</Label>
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
                      {isGerman ? "Unterschrift löschen" : "Clear Signature"}
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
                    {isGerman ? "Unterschrift hinzufügen" : "Add Signature"}
                  </Button>
                )}
              </div>
              
              <div className="text-sm text-muted-foreground">
                {isGerman ? "Datum" : "Date"}: {new Date().toLocaleDateString(isGerman ? "de-DE" : "en-US")}
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowTermsDialog(false)}>
              {isGerman ? "Abbrechen" : "Cancel"}
            </Button>
            <Button 
              onClick={() => acceptTermsMutation.mutate()}
              disabled={!termsAccepted || !signerName.trim() || !signatureImage || acceptTermsMutation.isPending}
              data-testid="button-submit-terms"
            >
              {acceptTermsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isGerman ? "Akzeptieren & Unterschreiben" : "Accept & Sign"}
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
        title={isGerman ? "Ihre Unterschrift" : "Your Signature"}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card className={!canSetupPayment ? "opacity-60" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {isGerman ? "Zahlungsmethode" : "Payment Method"}
            </CardTitle>
            <CardDescription>
              {isGerman 
                ? "Verwalten Sie Ihre Zahlungsmethode für die monatliche Abrechnung"
                : "Manage your payment method for monthly billing"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!canSetupPayment ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {isGerman 
                    ? "Bitte akzeptieren Sie zuerst die Nutzungsbedingungen."
                    : "Please accept the terms of use first."}
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
                  {isGerman ? "Rechnung erstellen" : "Generate Invoice"}
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
                          {invoice.recordCount} {isGerman ? 'Datensätze' : 'records'}
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
                          {invoice.status === "paid" ? (isGerman ? "Bezahlt" : "Paid") :
                           invoice.status === "pending" ? (isGerman ? "Ausstehend" : "Pending") :
                           invoice.status === "failed" ? (isGerman ? "Fehlgeschlagen" : "Failed") :
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
