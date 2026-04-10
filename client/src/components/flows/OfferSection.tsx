import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Props {
  promoCodeId: string | null;
  onChange: (promoCodeId: string | null, promoCode: string | null) => void;
}

export default function OfferSection({ promoCodeId, onChange }: Props) {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [tab, setTab] = useState<string>("new");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<string>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [description, setDescription] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const { data: existingCodes = [] } = useQuery({
    queryKey: ["promo-codes", hospitalId],
    queryFn: () =>
      apiRequest("GET", `/api/business/${hospitalId}/promo-codes`).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", `/api/business/${hospitalId}/promo-codes`, data).then((r) => r.json()),
    onSuccess: (newCode: any) => {
      queryClient.invalidateQueries({ queryKey: ["promo-codes", hospitalId] });
      onChange(newCode.id, newCode.code);
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      code: code || undefined,
      discountType,
      discountValue,
      description,
      validUntil: validUntil || undefined,
    });
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="new">Neu erstellen</TabsTrigger>
        <TabsTrigger value="existing">Bestehenden wählen</TabsTrigger>
      </TabsList>

      <TabsContent value="new" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Code (leer = auto)</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="z.B. SPRING25"
            />
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Frühlings-Angebot"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Rabatt-Typ</Label>
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Prozent (%)</SelectItem>
                <SelectItem value="fixed">CHF (fest)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Wert</Label>
            <Input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "percent" ? "20" : "500"}
            />
          </div>
          <div>
            <Label className="text-xs">Gültig bis</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>
        <Button
          onClick={handleCreate}
          disabled={!discountValue || createMutation.isPending}
          className="gap-2"
        >
          {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Code erstellen
        </Button>
      </TabsContent>

      <TabsContent value="existing" className="space-y-2">
        {(existingCodes as any[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine bestehenden Codes vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {(existingCodes as any[]).map((pc: any) => (
              <button
                key={pc.id}
                type="button"
                onClick={() => onChange(pc.id, pc.code)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                  promoCodeId === pc.id
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted/50"
                }`}
              >
                <Badge variant="outline" className="font-mono">{pc.code}</Badge>
                <span className="text-sm">{pc.description || "—"}</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {pc.discountType === "percent"
                    ? `${pc.discountValue}%`
                    : `CHF ${pc.discountValue}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
