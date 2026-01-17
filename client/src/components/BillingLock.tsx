import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreditCard, AlertCircle, Loader2 } from "lucide-react";

interface BillingStatus {
  licenseType: string;
  hasPaymentMethod: boolean;
  billingRequired: boolean;
}

export function BillingLock({ children }: { children: React.ReactNode }) {
  const activeHospital = useActiveHospital();
  const [location, navigate] = useLocation();

  const { data: billingStatus, isLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing", activeHospital?.id, "status"],
    queryFn: async () => {
      if (!activeHospital?.id) return null;
      const res = await fetch(`/api/billing/${activeHospital.id}/status`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!activeHospital?.id,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const allowedPaths = ["/admin/billing", "/admin", "/admin/users", "/admin/cameras"];
  const isAllowedPath = allowedPaths.some(path => location.startsWith(path));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (billingStatus?.billingRequired && !isAllowedPath) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 rounded-full bg-destructive/10">
              <CreditCard className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Payment Required</CardTitle>
            <CardDescription>
              Please add a payment method to continue using the app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your clinic requires a valid payment method to access the application.
              </AlertDescription>
            </Alert>
            <Button 
              className="w-full" 
              onClick={() => navigate("/admin/billing")}
              data-testid="button-go-to-billing"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Set Up Payment
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
