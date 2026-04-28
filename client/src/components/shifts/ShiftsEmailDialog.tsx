import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface RecipientsResponse {
  valid: string[];
  skipped: number;
}

interface SendResponse {
  sent: number;
  skipped: number;
  failed: number;
  recipients: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  unitId: string;
  monthStr: string; // YYYY-MM
  monthLabel: string; // e.g. "April 2026"
  /** Lazily generates the PDF as base64 only when the user clicks Send. */
  generatePdfBase64: () => Promise<string>;
}

export default function ShiftsEmailDialog({
  open,
  onOpenChange,
  hospitalId,
  unitId,
  monthStr,
  monthLabel,
  generatePdfBase64,
}: Props) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery<RecipientsResponse>({
    queryKey: ["email-month-pdf-recipients", hospitalId, unitId],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/staff-shifts/${encodeURIComponent(hospitalId)}/email-month-pdf/recipients?unitId=${encodeURIComponent(unitId)}`,
      ).then((r) => r.json()),
    enabled: open,
    staleTime: 0,
  });

  // Reset send state whenever the dialog re-opens.
  useEffect(() => {
    if (open) setSending(false);
  }, [open]);

  async function handleSend() {
    setSending(true);
    try {
      const pdfBase64 = await generatePdfBase64();
      const res = await apiRequest(
        "POST",
        `/api/staff-shifts/${encodeURIComponent(hospitalId)}/email-month-pdf`,
        { unitId, month: monthStr, pdfBase64 },
      );
      const json: SendResponse = await res.json();
      toast({
        title: "Schedule emailed",
        description: `Sent to ${json.sent} recipient${json.sent === 1 ? "" : "s"}` +
          (json.skipped ? `, ${json.skipped} skipped` : "") +
          (json.failed ? `, ${json.failed} failed` : ""),
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Failed to send schedule",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  const validCount = data?.valid.length ?? 0;
  const skippedCount = data?.skipped ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email schedule to team</DialogTitle>
          <DialogDescription>
            Send the {monthLabel} shift schedule as a PDF to all unit members with a valid email address.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading recipients…
            </div>
          ) : (
            <>
              <div className="text-sm">
                <strong>{validCount}</strong> recipient{validCount === 1 ? "" : "s"} will receive the PDF.
                {skippedCount > 0 && (
                  <span className="text-muted-foreground">
                    {" "}({skippedCount} skipped — no valid email)
                  </span>
                )}
              </div>
              {validCount > 0 && (
                <ul className="text-xs text-muted-foreground max-h-32 overflow-auto border rounded p-2 bg-muted/20">
                  {data!.valid.slice(0, 25).map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                  {data!.valid.length > 25 && (
                    <li>… and {data!.valid.length - 25} more</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || isLoading || validCount === 0}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send to {validCount}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
