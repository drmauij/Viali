import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type StammblattStatus = {
  status: 'missing' | 'invited' | 'in_progress' | 'submitted';
  inviteCount: number;
  lastInvitedAt?: string | null;
  tokenExpiresAt?: string | null;
  submittedAt?: string | null;
};

function daysAgo(iso?: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function StammblattStatusBadge({ value }: { value: StammblattStatus }) {
  const { status, inviteCount, lastInvitedAt, submittedAt } = value;
  const showFollowUpDot = status !== 'submitted' && inviteCount >= 3;

  const config = {
    missing:     { label: "Fehlt",          cls: "bg-red-100 text-red-800 hover:bg-red-100" },
    invited:     { label: "Eingeladen",     cls: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
    in_progress: { label: "In Bearbeitung", cls: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
    submitted:   { label: "Erhalten",       cls: "bg-green-100 text-green-800 hover:bg-green-100" },
  }[status];

  const sub =
    status === 'submitted'
      ? `am ${new Date(submittedAt!).toLocaleDateString('de-CH')}`
      : inviteCount > 0
        ? `${inviteCount}× gesendet${lastInvitedAt ? ` · vor ${daysAgo(lastInvitedAt)}d` : ""}`
        : "";

  return (
    <div className="flex items-center gap-2">
      <Badge className={config.cls}>{config.label}</Badge>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      {showFollowUpDot && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-2 h-2 rounded-full bg-red-600 inline-block cursor-default" />
          </TooltipTrigger>
          <TooltipContent>3+ Einladungen versendet — persönlich nachfassen?</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
