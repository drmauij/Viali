import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, BedDouble, MapPin, FileText, AlertTriangle, Pill, Clock } from "lucide-react";

type AnesthesiaRecord = {
  id: string;
  surgeryId: string;
  post_op_data?: {
    postOpDestination?: string;
    postOpNotes?: string;
    complications?: string;
    paracetamolTime?: string;
    nsarTime?: string;
    novalginTime?: string;
  };
};

type Surgery = {
  id: string;
  patientId: string;
  patientName: string;
  patientNumber: string;
  age: number;
  procedure: string;
};

export default function CasePacu() {
  const [, params] = useRoute("/anesthesia/cases/:id/pacu");
  const [, setLocation] = useLocation();

  const { data: surgery, isLoading: surgeryLoading } = useQuery<Surgery>({
    queryKey: [`/api/surgeries/${params?.id}`],
    enabled: !!params?.id,
  });

  const { data: anesthesiaRecord, isLoading: recordLoading } = useQuery<AnesthesiaRecord>({
    queryKey: [`/api/anesthesia/records/surgery/${params?.id}`],
    enabled: !!params?.id,
  });

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation(`/anesthesia/cases/${params?.id}`);
    }
  };

  const getDestinationBadge = (destination: string | undefined) => {
    if (!destination) return null;
    const label = destination.toUpperCase();
    const colors: Record<string, string> = {
      pacu: "bg-blue-500 text-white",
      icu: "bg-red-500 text-white",
      ward: "bg-green-500 text-white",
      home: "bg-gray-500 text-white",
    };
    return (
      <Badge className={colors[destination] || "bg-gray-500 text-white"}>
        {label}
      </Badge>
    );
  };

  const getMedicationDisplay = (time: string | undefined) => {
    if (!time) return <span className="text-muted-foreground text-sm">Not specified</span>;
    if (time === "Immediately") return <Badge variant="outline" className="bg-green-50">Immediately</Badge>;
    if (time === "Contraindicated") return <Badge variant="outline" className="bg-red-50">Contraindicated</Badge>;
    return <Badge variant="outline" className="bg-blue-50">{time}</Badge>;
  };

  const isLoading = surgeryLoading || recordLoading;
  const postOpData = anesthesiaRecord?.post_op_data;

  return (
    <div className="container mx-auto p-4 pb-20">
      <Button 
        variant="ghost" 
        className="gap-2 mb-4" 
        onClick={handleBack}
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to PACU List
      </Button>

      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Patient Header */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <BedDouble className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-2xl" data-testid="text-patient-name">
                      {surgery?.patientName}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1" data-testid="text-patient-info">
                      {surgery?.patientNumber} • Age {surgery?.age}
                    </p>
                  </div>
                </div>
                {getDestinationBadge(postOpData?.postOpDestination)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span data-testid="text-procedure">{surgery?.procedure}</span>
              </div>
            </CardContent>
          </Card>

          {/* Post-Operative Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Post-Operative Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Destination */}
              {postOpData?.postOpDestination && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Destination</h4>
                  <div>{getDestinationBadge(postOpData.postOpDestination)}</div>
                </div>
              )}

              {/* Post-Op Notes */}
              {postOpData?.postOpNotes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Post-Operative Notes
                    </h4>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md" data-testid="text-postop-notes">
                      {postOpData.postOpNotes}
                    </p>
                  </div>
                </>
              )}

              {/* Complications */}
              {postOpData?.complications && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      Complications
                    </h4>
                    <p className="text-sm whitespace-pre-wrap bg-red-50 p-3 rounded-md border border-red-200" data-testid="text-complications">
                      {postOpData.complications}
                    </p>
                  </div>
                </>
              )}

              {/* Empty state */}
              {!postOpData?.postOpDestination && !postOpData?.postOpNotes && !postOpData?.complications && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No post-operative information recorded yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Medication Timing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5" />
                Medication Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Paracetamol */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Paracetamol</span>
                  </div>
                  <div data-testid="text-paracetamol-time">
                    {getMedicationDisplay(postOpData?.paracetamolTime)}
                  </div>
                </div>

                <Separator />

                {/* NSAR */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">NSAR</span>
                  </div>
                  <div data-testid="text-nsar-time">
                    {getMedicationDisplay(postOpData?.nsarTime)}
                  </div>
                </div>

                <Separator />

                {/* Novalgin */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">Novalgin</span>
                  </div>
                  <div data-testid="text-novalgin-time">
                    {getMedicationDisplay(postOpData?.novalginTime)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
