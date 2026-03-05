import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime } from "@/lib/dateUtils";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const EVENT_TYPES = [
  { value: "all", label: "All Events" },
  { value: "login_success", label: "Login Success" },
  { value: "login_failed", label: "Login Failed" },
  { value: "logout", label: "Logout" },
  { value: "password_change", label: "Password Change" },
  { value: "password_reset_request", label: "Password Reset Request" },
  { value: "password_reset_complete", label: "Password Reset Complete" },
  { value: "google_login_success", label: "Google Login" },
] as const;

function eventBadge(eventType: string) {
  switch (eventType) {
    case "login_success":
    case "google_login_success":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{eventType.replace(/_/g, " ")}</Badge>;
    case "login_failed":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">{eventType.replace(/_/g, " ")}</Badge>;
    case "logout":
      return <Badge variant="secondary">{eventType}</Badge>;
    case "password_change":
    case "password_reset_request":
    case "password_reset_complete":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">{eventType.replace(/_/g, " ")}</Badge>;
    default:
      return <Badge variant="outline">{eventType}</Badge>;
  }
}

const PAGE_SIZE = 50;

export function LoginAuditLogTab({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [emailSearch, setEmailSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: [`/api/admin/${hospitalId}/login-audit-logs`, eventTypeFilter, emailSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (eventTypeFilter !== "all") params.set("eventType", eventTypeFilter);
      if (emailSearch.trim()) params.set("userId", emailSearch.trim());
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const res = await apiRequest("GET", `/api/admin/${hospitalId}/login-audit-logs?${params.toString()}`);
      return res.json() as Promise<{
        logs: Array<{
          id: string;
          userId: string | null;
          email: string;
          eventType: string;
          ipAddress: string | null;
          userAgent: string | null;
          failureReason: string | null;
          hospitalId: string | null;
          createdAt: string | null;
          userName: string | null;
        }>;
        total: number;
      }>;
    },
    enabled: !!hospitalId,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Filter by event" />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((et) => (
              <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search by email..."
          value={emailSearch}
          onChange={(e) => { setEmailSearch(e.target.value); setPage(0); }}
          className="w-full sm:w-[250px]"
        />

        <div className="ml-auto text-sm text-muted-foreground self-center">
          {total} {total === 1 ? "event" : "events"}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No login events found.
        </div>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Date/Time</th>
                  <th className="text-left px-3 py-2 font-medium">User</th>
                  <th className="text-left px-3 py-2 font-medium">Event</th>
                  <th className="text-left px-3 py-2 font-medium hidden md:table-cell">IP Address</th>
                  <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium truncate max-w-[200px]">
                        {log.userName && log.userName.trim() !== "" ? log.userName : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{log.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      {eventBadge(log.eventType)}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-muted-foreground font-mono text-xs">
                      {log.ipAddress || "—"}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground text-xs">
                      {log.failureReason ? (
                        <span className="text-red-600 dark:text-red-400">{log.failureReason.replace(/_/g, " ")}</span>
                      ) : log.userAgent ? (
                        <span className="truncate block max-w-[250px]" title={log.userAgent}>
                          {log.userAgent.length > 60 ? log.userAgent.slice(0, 60) + "…" : log.userAgent}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
