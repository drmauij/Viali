import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BedDouble, Construction } from "lucide-react";

export default function CasePacu() {
  const [, params] = useRoute("/anesthesia/cases/:id/pacu");
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation(`/anesthesia/cases/${params?.id}`);
    }
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <Button 
        variant="ghost" 
        className="gap-2 mb-4" 
        onClick={handleBack}
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Case
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <BedDouble className="h-6 w-6 text-primary" />
            <div>
              <div>Patient-Specific PACU Record</div>
              <div className="text-sm font-normal text-muted-foreground mt-1">
                Case ID: {params?.id}
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Construction className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Coming Soon</h2>
            <p className="text-muted-foreground max-w-md">
              Patient-specific PACU monitoring and documentation features are currently under development. 
              This page will provide detailed post-anesthesia care records for individual surgical cases.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              For now, please use the general PACU overview at{" "}
              <Button
                variant="link"
                className="p-0 h-auto text-sm"
                onClick={() => setLocation("/anesthesia/pacu")}
                data-testid="link-general-pacu"
              >
                PACU
              </Button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
