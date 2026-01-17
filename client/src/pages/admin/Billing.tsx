import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { 
  CreditCard, 
  ExternalLink, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Trash2,
  Download
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
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount: number;
  currency: string;
  created: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
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
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showCardForm, setShowCardForm] = useState(false);

  const { data: billingStatus, isLoading: statusLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing", hospitalId, "status"],
    queryFn: async () => {
      const res = await fetch(`/api/billing/${hospitalId}/status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch billing status");
      return res.json();
    },
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["/api/billing", hospitalId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/billing/${hospitalId}/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
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

  if (statusLoading) {
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

  return (
    <div className="space-y-6">
      {billingStatus.licenseType === "free" ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Your clinic is on the <strong>Free Plan</strong>. No payment required.
          </AlertDescription>
        </Alert>
      ) : billingStatus.billingRequired ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please add a payment method to continue using the app.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Method
            </CardTitle>
            <CardDescription>
              Manage your payment method for monthly billing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {billingStatus.paymentMethod ? (
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
                <Badge variant={billingStatus.licenseType === "free" ? "secondary" : "default"}>
                  {billingStatus.licenseType === "free" ? "Free" : "Basic"}
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
                Invoices
              </CardTitle>
              <CardDescription>View and download your invoices</CardDescription>
            </div>
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
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoicesData?.invoices && invoicesData.invoices.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {invoicesData.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{invoice.number || invoice.id}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(invoice.created).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          invoice.status === "paid"
                            ? "default"
                            : invoice.status === "open"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {invoice.status}
                      </Badge>
                      <span className="font-medium">
                        {invoice.currency.toUpperCase()} {invoice.amount.toFixed(2)}
                      </span>
                      {invoice.pdfUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(invoice.pdfUrl!, "_blank")}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
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
  const activeHospital = useActiveHospital();

  if (!activeHospital?.id) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Please select a hospital to view billing</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground">Manage your subscription and payment methods</p>
      </div>
      <BillingContent hospitalId={activeHospital.id} />
    </div>
  );
}
