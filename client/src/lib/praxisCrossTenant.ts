export interface CrossTenantSurgery {
  referralStatus?: string | null;
  destinationPortalToken?: string | null;
  pendingActionRequest?: {
    id: string;
    type: "cancellation" | "reschedule" | "suspension";
    reason: string | null;
    proposedDate?: string | null;
    proposedTimeFrom?: number | null;
    proposedTimeTo?: number | null;
  } | null;
  rescheduleHistory?: Array<{
    type?: string;
    request_type?: string;
    reason?: string | null;
    at?: string;
  }> | null;
}

/** A praxis source surgery whose changes route through destination approval. */
export function isCrossTenantSource(
  surgery: CrossTenantSurgery | null | undefined,
): boolean {
  return surgery?.referralStatus === "confirmed_external";
}

export function hasPendingCrossTenantAction(
  surgery: CrossTenantSurgery | null | undefined,
): boolean {
  return !!surgery?.pendingActionRequest;
}

/**
 * Returns the most recent request_refused journal entry from the source
 * surgery's rescheduleHistory column. Used to display "Last X request
 * refused: <reason>" inline on the praxis card until the surgeon files
 * a new request (which the server-side gate enforces by rejecting new
 * actions while a pending one exists).
 */
export function latestRefusal(
  surgery: CrossTenantSurgery | null | undefined,
): { request_type: string; reason: string | null; at: string } | null {
  const history = surgery?.rescheduleHistory ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry?.type === "request_refused") {
      return {
        request_type: entry.request_type ?? "unknown",
        reason: entry.reason ?? null,
        at: entry.at ?? "",
      };
    }
  }
  return null;
}

/**
 * Build the URL that opens the destination clinic's surgeon portal at the
 * right surgery. Used by the praxis card's Download Surgery Summary entry.
 * The destination portal already renders the summary for the surgeon —
 * we don't duplicate the renderer.
 */
export function buildDestinationSummaryUrl(
  destinationPortalToken: string,
  surgeryId: string,
): string {
  return `/surgeon-portal/${encodeURIComponent(destinationPortalToken)}/?surgery=${encodeURIComponent(surgeryId)}`;
}
