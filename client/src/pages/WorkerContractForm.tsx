import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { SignatureCanvas } from "@/components/ui/signature-canvas";
import { DynamicContractForm } from "@/components/contracts/DynamicContractForm";
import { ContractReadOnly } from "@/components/contracts/ContractReadOnly";
import { Loader2, CheckCircle, AlertCircle, Building2 } from "lucide-react";
import type { Block, VariablesSchema } from "@shared/contractTemplates/types";
import { buildZodSchema } from "@shared/contractTemplates/buildZodSchema";
import { applyHospitalSettings } from "@/lib/dateUtils";

// ─── API response shapes ────────────────────────────────────────────────────

interface TemplateSummary {
  id: string;
  name: string;
  language: string;
  blocks: Block[];
  variables: VariablesSchema;
}

interface FetchedContract {
  contractId?: string;
  template: TemplateSummary;
  prefill?: Record<string, unknown>;
  regional?: {
    dateFormat: "european" | "american";
    hourFormat: "24h" | "12h";
    timezone: string;
    defaultLanguage: string;
    currency: string;
  };
  mode: "single-use" | "shareable";
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WorkerContractForm() {
  // Three URL patterns that all map to this component.
  const [matchC, paramsC] = useRoute<{ token: string }>("/contract/c/:token");
  const [matchT, paramsT] = useRoute<{ token: string }>("/contract/t/:token");
  const [matchLegacy, paramsLegacy] = useRoute<{ token: string }>("/contract/:token");

  // Derive the API path segment from whichever route matched.
  const apiPath = matchC
    ? `c/${paramsC!.token}`
    : matchT
      ? `t/${paramsT!.token}`
      : matchLegacy
        ? `t/${paramsLegacy!.token}`
        : null;

  const fetchUrl = apiPath ? `/api/public/contracts/${apiPath}` : null;
  const submitUrl = apiPath ? `/api/public/contracts/${apiPath}/submit` : null;

  const { toast } = useToast();

  const [contract, setContract] = useState<FetchedContract | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [location, setLocation] = useState("");
  const [signature, setSignature] = useState("");

  const sigRef = useRef<{ clear: () => void } | null>(null);
  const formSectionRef = useRef<HTMLDivElement | null>(null);

  // ─── Fetch template / prefill ─────────────────────────────────────────────

  useEffect(() => {
    if (!fetchUrl) {
      setErrorMsg("Ungültiger Vertragslink.");
      setIsLoading(false);
      return;
    }

    fetch(fetchUrl)
      .then((r) => {
        if (r.status === 410) {
          setErrorMsg(
            "Dieser Vertragslink wurde bereits verwendet und ist nicht mehr gültig.",
          );
          return null;
        }
        if (r.status === 404) {
          setErrorMsg(
            "Ungültiger Vertragslink. Bitte wenden Sie sich an die Klinik.",
          );
          return null;
        }
        if (!r.ok) {
          setErrorMsg("Fehler beim Laden des Vertrags.");
          return null;
        }
        return r.json() as Promise<FetchedContract>;
      })
      .then((res) => {
        if (res) {
          setContract(res);
          setFormData(res.prefill ?? {});
          if (res.regional) {
            applyHospitalSettings({
              dateFormat: res.regional.dateFormat,
              hourFormat: res.regional.hourFormat,
              currency: res.regional.currency,
            });
          }
        }
      })
      .catch(() => {
        setErrorMsg("Verbindungsfehler. Bitte versuchen Sie es später erneut.");
      })
      .finally(() => setIsLoading(false));
  }, [fetchUrl]);

  // ─── Submit ───────────────────────────────────────────────────────────────

  function labelForPath(path: string, variables: VariablesSchema): string {
    const simple = variables.simple.find((s) => s.key === path);
    if (simple) return simple.label;
    for (const list of variables.selectableLists) {
      if (path === list.key) return list.label;
      if (path.startsWith(list.key + ".")) return list.label;
    }
    return path.split(".").pop() ?? path;
  }

  async function onSubmit() {
    if (!contract) return;

    // Validate form data with the same schema the server uses, so the worker
    // sees exactly which fields are missing/invalid before hitting the API.
    const dataParsed = buildZodSchema(contract.template.variables).safeParse(
      formData,
    );
    if (!dataParsed.success) {
      const labels = Array.from(
        new Set(
          dataParsed.error.issues.map((iss) =>
            labelForPath(iss.path.join("."), contract.template.variables),
          ),
        ),
      );
      toast({
        title: "Bitte alle Pflichtfelder ausfüllen.",
        description: `Fehlt oder ungültig: ${labels.join(", ")}`,
        variant: "destructive",
      });
      formSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    if (!signature) {
      toast({
        title: "Bitte unterschreiben Sie zuerst.",
        variant: "destructive",
      });
      return;
    }
    if (!location.trim()) {
      toast({
        title: "Bitte geben Sie den Unterschriftsort an.",
        variant: "destructive",
      });
      return;
    }
    if (!submitUrl) return;

    setIsSubmitting(true);
    try {
      const r = await fetch(submitUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: formData,
          workerSignature: signature,
          workerSignatureLocation: location,
        }),
      });

      if (r.ok) {
        setIsSubmitted(true);
      } else if (r.status === 410) {
        toast({
          title:
            "Dieser Link wurde bereits verwendet und kann nicht erneut eingereicht werden.",
          variant: "destructive",
        });
      } else if (r.status === 429) {
        toast({
          title: "Zu viele Anfragen — bitte später erneut versuchen.",
          variant: "destructive",
        });
      } else {
        const body = await r.json().catch(() => ({}));
        toast({
          title: "Fehler beim Einreichen.",
          description: (body as { message?: string }).message,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Verbindungsfehler.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Render states ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">Laden…</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Fehler</h2>
            <p className="text-muted-foreground">{errorMsg}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">
              Vertrag eingereicht!
            </h2>
            <p className="text-muted-foreground">
              Ihr Vertrag wurde erfolgreich eingereicht und wartet nun auf die
              Unterschrift des Managers. Sie erhalten eine Benachrichtigung,
              sobald der Vertrag vollständig unterzeichnet ist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!contract) return null;

  // ─── Main form ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{contract.template.name}</CardTitle>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-1">
              <Building2 className="w-4 h-4" />
              <span>
                {contract.mode === "single-use"
                  ? "Persönlicher Vertragslink"
                  : "Allgemeiner Vertragslink"}
              </span>
            </div>
          </CardHeader>
        </Card>

        {/* Dynamic variable fields driven by template schema */}
        <div ref={formSectionRef}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ihre Angaben</CardTitle>
            </CardHeader>
            <CardContent>
              <DynamicContractForm
                variables={contract.template.variables}
                initial={formData}
                onChange={setFormData}
              />
            </CardContent>
          </Card>
        </div>

        {/* Read-only contract document — updates live as the form is filled */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Vertragstext
          </h2>
          <ContractReadOnly
            blocks={contract.template.blocks}
            variables={contract.template.variables}
            data={formData}
          />
        </div>

        {/* Signature section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Unterschrift</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="sig-location">Unterschriftsort *</Label>
              <Input
                id="sig-location"
                placeholder="z.B. Kreuzlingen"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                data-testid="input-signature-location"
              />
            </div>

            <SignatureCanvas
              label="Ihre Unterschrift"
              value={signature}
              onChange={setSignature}
              className="border rounded-lg"
            />
          </CardContent>
        </Card>

        <Separator />

        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="w-full"
          size="lg"
          data-testid="button-submit-contract"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Wird eingereicht…
            </>
          ) : (
            "Unterzeichnen & einreichen"
          )}
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Viali</p>
        </div>
      </div>
    </div>
  );
}
