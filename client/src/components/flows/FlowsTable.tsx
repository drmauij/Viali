import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/dateUtils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export interface FlowRow {
  id: string;
  name: string;
  status: string;
  channel?: string | null;
  recipientCount?: number | null;
  sentAt?: string | Date | null;
  abTestEnabled?: boolean;
  audienceHospitals?: Array<{ hospitalId: string; hospitalName: string }>;
  // Allow arbitrary additional fields without forcing every consumer to type them
  [key: string]: unknown;
}

export interface FlowsTableMetricsRow {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  bookings: number;
  revenue: number;
}

export interface FlowsTableProps {
  flows: FlowRow[];
  /** Per-flow campaign metrics keyed by flow id. Undefined ⇒ shows "—". */
  metricsByFlow?: Record<string, FlowsTableMetricsRow>;
  /** Optional click handler — clinic page uses this to open drafts in the editor. */
  onRowClick?: (flow: FlowRow) => boolean | void;
  /**
   * Chain-only audience column slot. Clinic omits it.
   * `header` renders as <TableHead>, `cell(row)` as <TableCell> per row.
   */
  audienceColumn?: {
    header: ReactNode;
    cell: (row: FlowRow) => ReactNode;
  };
  /** Per-row trailing actions (icons / delete buttons). Wrapped so click events stop propagation. */
  actions?: (row: FlowRow) => ReactNode;
}

/**
 * Shared campaign list table — used by both clinic `/business/flows` and chain
 * `/chain/campaigns`. Same columns, same statuses, same metrics layout. The
 * only divergence is the optional Audience column (chain) and the per-row
 * actions slot owned by the parent.
 */
export default function FlowsTable({
  flows,
  metricsByFlow = {},
  onRowClick,
  audienceColumn,
  actions,
}: FlowsTableProps) {
  const { t } = useTranslation();

  const STATUS_BADGE: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    draft: { label: t("flows.status.draft", "Draft"), variant: "outline" },
    sending: { label: t("flows.status.sending", "Sending..."), variant: "secondary" },
    sent: { label: t("flows.status.sent", "Sent"), variant: "default" },
    failed: { label: t("flows.status.failed", "Failed"), variant: "destructive" },
  };

  const CHANNEL_LABEL: Record<string, string> = {
    sms: "SMS",
    email: "Email",
    html_email: t("flows.channel.newsletter", "Newsletter"),
  };

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.name", "Name")}</TableHead>
            <TableHead>{t("common.status", "Status")}</TableHead>
            <TableHead>{t("flows.table.channel", "Channel")}</TableHead>
            {audienceColumn && <TableHead>{audienceColumn.header}</TableHead>}
            <TableHead>{t("flows.table.recipients", "Recipients")}</TableHead>
            <TableHead>{t("flows.table.sent", "Sent")}</TableHead>
            <TableHead>{t("flows.table.opens", "Opens")}</TableHead>
            <TableHead>{t("flows.table.booked", "Booked")}</TableHead>
            <TableHead>{t("flows.table.revenue", "Revenue")}</TableHead>
            {actions && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flows.map((c) => {
            const metrics = metricsByFlow[c.id];
            const channelKey = (c.channel ?? "") as string;
            return (
              <TableRow
                key={c.id}
                className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={() => onRowClick?.(c)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {c.name}
                    {c.abTestEnabled && (
                      <Badge variant="outline" className="text-xs border-purple-400 text-purple-600">
                        A/B
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[c.status]?.variant || "outline"}>
                    {STATUS_BADGE[c.status]?.label || c.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(channelKey && CHANNEL_LABEL[channelKey]) || channelKey || "—"}
                </TableCell>
                {audienceColumn && <TableCell>{audienceColumn.cell(c)}</TableCell>}
                <TableCell>{c.recipientCount ?? "—"}</TableCell>
                <TableCell>
                  {c.sentAt ? new Date(c.sentAt as string).toLocaleDateString("de-CH") : "—"}
                </TableCell>
                <TableCell>
                  {metrics && metrics.sent > 0 ? (
                    <span>
                      {metrics.opened}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({Math.round((metrics.opened / metrics.sent) * 100)}%)
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{metrics?.bookings ?? "—"}</TableCell>
                <TableCell className="font-medium">
                  {metrics ? formatCurrency(metrics.revenue) : "—"}
                </TableCell>
                {actions && (
                  <TableCell onClick={(e) => e.stopPropagation()}>{actions(c)}</TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
