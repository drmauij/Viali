import { useState } from "react";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SegmentBuilder, { type SegmentFilter } from "@/components/flows/SegmentBuilder";
import ChannelPicker, { type Channel } from "@/components/flows/ChannelPicker";
import OfferSection from "@/components/flows/OfferSection";
import ReviewSend from "@/components/flows/ReviewSend";

export default function FlowCreate() {
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const { toast } = useToast();

  const [name, setName] = useState("Neue Kampagne");
  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [promoCodeId, setPromoCodeId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!hospitalId) return;
    setSending(true);
    try {
      // First create the draft campaign
      const flowRes = await apiRequest("POST", `/api/business/${hospitalId}/flows`, {
        name,
        segmentFilters: filters,
        channel,
        promoCodeId,
      });
      const flow = await flowRes.json();

      // Then send it
      await apiRequest("POST", `/api/business/${hospitalId}/flows/${flow.id}/send`);

      toast({ title: "Kampagne gesendet", description: `${name} wurde erfolgreich gesendet.` });
      navigate("/business/flows");
    } catch (err) {
      toast({
        title: "Fehler",
        description: "Die Kampagne konnte nicht gesendet werden.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const isReady = filters.length > 0 && channel !== null;

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/flows")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Neue Kampagne</h1>
          <p className="text-xs text-muted-foreground">Schritt für Schritt konfigurieren</p>
        </div>
      </div>

      {/* Campaign name */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Kampagnenname</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="campaign-name" className="sr-only">Name</Label>
          <Input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Frühlings-Aktion 2026"
          />
        </CardContent>
      </Card>

      {/* Segment */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Zielgruppe</CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentBuilder
            filters={filters}
            onChange={setFilters}
            patientCount={patientCount}
            onCountChange={setPatientCount}
          />
        </CardContent>
      </Card>

      {/* Channel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Kanal</CardTitle>
        </CardHeader>
        <CardContent>
          <ChannelPicker value={channel} onChange={setChannel} />
        </CardContent>
      </Card>

      {/* Offer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Angebot / Rabattcode (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <OfferSection
            promoCodeId={promoCodeId}
            onChange={(id, code) => {
              setPromoCodeId(id);
              setPromoCode(code);
            }}
          />
        </CardContent>
      </Card>

      {/* Review + Send */}
      <ReviewSend
        patientCount={patientCount}
        channel={channel}
        promoCode={promoCode}
        campaignName={name}
        onSend={handleSend}
        sending={sending}
        disabled={!isReady}
      />
    </div>
  );
}
