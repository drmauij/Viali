import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SidebarHospital } from "@/components/sidebar/buildRows";

const ADMIN_ROLES = new Set(["admin", "group_admin", "manager", "marketing"]);

function uniqueIds<T extends { id: string }>(rows: T[]): string[] {
  return Array.from(new Set(rows.map(r => r.id)));
}

/**
 * Cross-hospital alert summary used by both the dropdown (per-card dots) and
 * the TopBar trigger (single aggregate dot). Each per-hospital count is
 * fetched via a single bulk endpoint (`/api/<resource>-counts?hospitalIds=...`)
 * — one HTTP call instead of an N+1 fan-out that Sentry kept flagging
 * (VIALI-QQ). Server filters silently to hospitals the caller can read so
 * inaccessible IDs don't 403 the whole batch.
 *
 * Questionnaire (`/api/questionnaire/unassociated/count`) scopes via the
 * X-Active-Hospital-Id header, so it stays on the active hospital only — a
 * cross-hospital variant would need a custom queryFn that overrides the
 * header per call.
 */
export interface SidebarAlertSummary {
  /** New-leads count keyed by hospitalId (clinic admin/marketing audience). */
  leadsByHospitalId: Record<string, number>;
  /** Surgery requests + surgeon action requests, keyed by hospitalId. */
  surgeryAlertByHospitalId: Record<string, number>;
  /** Unassociated questionnaires for the active hospital, if any. */
  activeQuestionnaireAlert: boolean;
  /** True when any of the above signals a pending item. */
  hasAnyAlert: boolean;
}

export function useSidebarAlerts(
  hospitals: SidebarHospital[],
  activeHospital: SidebarHospital | null,
): SidebarAlertSummary {
  const clinicAlertHospitalIds = useMemo(
    () =>
      uniqueIds(
        hospitals.filter(
          h => h.unitType === "clinic" && ADMIN_ROLES.has(h.role),
        ),
      ),
    [hospitals],
  );

  const surgeryAlertHospitalIds = useMemo(
    () =>
      uniqueIds(
        hospitals.filter(
          h =>
            (h.unitType === "anesthesia" || h.unitType === "or") &&
            (ADMIN_ROLES.has(h.role) || !!h.canPlanOps),
        ),
      ),
    [hospitals],
  );

  // Bulk endpoints replace per-hospital useQueries fan-outs that Sentry
  // flagged as N+1s (VIALI-QQ) when the user can read several hospitals. IDs
  // are sorted in the query key so the cache stays stable across renders
  // regardless of how the source `hospitals` array is ordered. queryKey[0]
  // doubles as the URL the default queryFn fetches.
  const leadsCountsKey = [...clinicAlertHospitalIds].sort().join(",");
  const surgeryCountsKey = [...surgeryAlertHospitalIds].sort().join(",");

  const { data: leadsCountsData } = useQuery<{ counts: Record<string, number> }>({
    queryKey: [`/api/leads-counts?hospitalIds=${leadsCountsKey}`],
    enabled: clinicAlertHospitalIds.length > 0,
    refetchInterval: 60000,
  });
  const { data: surgeryRequestsData } = useQuery<{ counts: Record<string, number> }>({
    queryKey: [`/api/external-surgery-requests-counts?hospitalIds=${surgeryCountsKey}`],
    enabled: surgeryAlertHospitalIds.length > 0,
    refetchInterval: 60000,
  });
  const { data: surgeonActionData } = useQuery<{ counts: Record<string, number> }>({
    queryKey: [`/api/surgeon-action-requests-counts?hospitalIds=${surgeryCountsKey}`],
    enabled: surgeryAlertHospitalIds.length > 0,
    refetchInterval: 60000,
  });

  const clinicActive = activeHospital?.unitType === "clinic";
  const { data: questionnaireCount } = useQuery<{ count: number }>({
    queryKey: ["/api/questionnaire/unassociated/count"],
    enabled: clinicActive && !!activeHospital?.addonQuestionnaire,
    refetchInterval: 60000,
  });

  const leadsByHospitalId: Record<string, number> = {};
  clinicAlertHospitalIds.forEach(id => {
    leadsByHospitalId[id] = leadsCountsData?.counts?.[id] ?? 0;
  });

  const surgeryAlertByHospitalId: Record<string, number> = {};
  surgeryAlertHospitalIds.forEach(id => {
    const reqs = surgeryRequestsData?.counts?.[id] ?? 0;
    const acts = surgeonActionData?.counts?.[id] ?? 0;
    surgeryAlertByHospitalId[id] = reqs + acts;
  });

  const activeQuestionnaireAlert = (questionnaireCount?.count ?? 0) > 0;

  const hasAnyAlert =
    Object.values(leadsByHospitalId).some(v => v > 0) ||
    Object.values(surgeryAlertByHospitalId).some(v => v > 0) ||
    activeQuestionnaireAlert;

  return {
    leadsByHospitalId,
    surgeryAlertByHospitalId,
    activeQuestionnaireAlert,
    hasAnyAlert,
  };
}
