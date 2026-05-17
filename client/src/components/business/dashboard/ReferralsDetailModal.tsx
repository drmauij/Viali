import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate } from "@/lib/dateUtils";
import { prettifyReferralSource } from "./ReferralsBySourceCard";

interface ReferralDetail {
  id: string;
  createdAt: string;
  sourceDetail: string | null;
  captureMethod: string;
  patientName: string | null;
  appointmentStatus: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
}

interface Props {
  hospitalId: string;
  range: string;
  source: string | null;
  onClose: () => void;
}

const STATUS_TONE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  confirmed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-300",
  no_show: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
};

export default function ReferralsDetailModal({ hospitalId, range, source, onClose }: Props) {
  const { t } = useTranslation();
  const open = !!source;

  const query = useQuery<{ source: string; referrals: ReferralDetail[] }>({
    queryKey: [`/api/business/${hospitalId}/referrals-detail?source=${encodeURIComponent(source ?? '')}&range=${range}&limit=200`],
    enabled: open && !!hospitalId && !!source,
  });

  const referrals = query.data?.referrals ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("business.drilldown.referralsTitle", "Referrals from {{src}}", {
              src: source ? prettifyReferralSource(source) : "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("business.drilldown.referralsDesc", "{{n}} referrals captured in the selected period.", { n: referrals.length })}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : referrals.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6">
            {t("business.drilldown.noReferralsForSource", "No referrals from this source for the selected period.")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("business.drilldown.received", "Received")}</TableHead>
                <TableHead>{t("business.drilldown.patient", "Patient")}</TableHead>
                <TableHead>{t("business.drilldown.sourceDetail", "Detail / Campaign")}</TableHead>
                <TableHead>{t("business.drilldown.captureMethod", "Capture")}</TableHead>
                <TableHead>{t("business.drilldown.status", "Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="font-medium">{r.patientName ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.sourceDetail && <div>{r.sourceDetail}</div>}
                    {r.utmCampaign && <div className="text-muted-foreground">{r.utmCampaign}</div>}
                    {!r.sourceDetail && !r.utmCampaign && "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.captureMethod}</TableCell>
                  <TableCell>
                    {r.appointmentStatus ? (
                      <Badge variant="secondary" className={STATUS_TONE[r.appointmentStatus] ?? "bg-muted text-muted-foreground"}>
                        {r.appointmentStatus}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("business.drilldown.noAppointment", "no appointment")}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
