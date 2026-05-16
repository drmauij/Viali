import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function ReferralPartnersCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const partners = useQuery<any[]>({
    queryKey: ["/api/referral-partnerships"],
    queryFn: async () => {
      const r = await fetch("/api/referral-partnerships", { credentials: "include" });
      if (!r.ok) throw new Error("failed to load partners");
      return r.json();
    },
  });

  const incoming = useQuery<any[]>({
    queryKey: ["/api/referral-partnerships/incoming"],
    queryFn: async () => {
      const r = await fetch("/api/referral-partnerships/incoming", { credentials: "include" });
      if (!r.ok) throw new Error("failed to load incoming");
      return r.json();
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/referral-partnerships/codes", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "failed");
      return r.json();
    },
    onSuccess: (data) => setGeneratedCode(data.code),
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const redeem = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/referral-partnerships/redeem", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/referral-partnerships"] });
      setCode("");
      toast({ title: "Pairing request sent. Awaiting destination approval." });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/referral-partnerships/${id}/approve`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/referral-partnerships"] });
      qc.invalidateQueries({ queryKey: ["/api/referral-partnerships/incoming"] });
    },
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/referral-partnerships/${id}/reject`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/referral-partnerships/incoming"] }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/referral-partnerships/${id}/revoke`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/referral-partnerships"] }),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Referral Partners</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {incoming.data && incoming.data.length > 0 && (
          <section>
            <h4 className="text-sm font-semibold mb-2">Incoming requests</h4>
            <div className="space-y-2">
              {incoming.data.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-2 border-2 border-amber-200 bg-amber-50 rounded dark:bg-amber-950/30 dark:border-amber-800">
                  <div>
                    <div className="font-medium text-sm">{p.sourceName}</div>
                    <div className="text-xs text-muted-foreground">Requested via {p.pairingSource}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => reject.mutate(p.id)}>Reject</Button>
                    <Button size="sm" onClick={() => approve.mutate(p.id)}>Approve</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h4 className="text-sm font-semibold mb-2">Add a referral partner</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Enter the 8-character pairing code provided by the destination hospital.
          </p>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7P9A2N3"
              maxLength={8}
              data-testid="input-pairing-code"
            />
            <Button onClick={() => redeem.mutate()} disabled={code.length !== 8 || redeem.isPending}>
              Redeem
            </Button>
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold mb-2">Generate code (for incoming requests)</h4>
          <Button onClick={() => generate.mutate()} variant="outline" disabled={generate.isPending}>
            Generate code
          </Button>
          {generatedCode && (
            <div className="mt-2 p-2 bg-muted rounded font-mono text-lg" data-testid="generated-pairing-code">
              {generatedCode}
              <span className="ml-2 text-xs text-muted-foreground font-sans">valid for 30 minutes</span>
            </div>
          )}
        </section>

        <section>
          <h4 className="text-sm font-semibold mb-2">Current partners</h4>
          {partners.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">No active partners yet.</p>
          )}
          <div className="space-y-2">
            {partners.data?.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <div className="font-medium text-sm">{p.destinationName ?? p.destinationHospitalId}</div>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="outline" className="mr-1">{p.status}</Badge>
                    Paired via {p.pairingSource}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(p.id)}>End partnership</Button>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
