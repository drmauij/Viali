import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import type { SidebarHospital } from "@/components/sidebar/buildRows";

const ADMIN_ROLES = new Set(["admin", "group_admin", "manager", "marketing"]);

function uniqueIds<T extends { id: string }>(rows: T[]): string[] {
  return Array.from(new Set(rows.map(r => r.id)));
}

/**
 * Cross-hospital alert summary used by both the dropdown (per-card dots) and
 * the TopBar trigger (single aggregate dot). Endpoints with hospitalId in
 * the URL are fanned out via useQueries so dots reflect every hospital the
 * user has access to — not only the currently-active one. React Query
 * dedupes across the two consumers so each query runs once per refetch
 * interval regardless of how many components subscribe.
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

  const leadsQueries = useQueries({
    queries: clinicAlertHospitalIds.map(id => ({
      queryKey: [`/api/business/${id}/leads-count`],
      refetchInterval: 60000,
    })),
  });
  const surgeryRequestsQueries = useQueries({
    queries: surgeryAlertHospitalIds.map(id => ({
      queryKey: [`/api/hospitals/${id}/external-surgery-requests/count`],
      refetchInterval: 60000,
    })),
  });
  const surgeonActionQueries = useQueries({
    queries: surgeryAlertHospitalIds.map(id => ({
      queryKey: [`/api/hospitals/${id}/surgeon-action-requests/count`],
      refetchInterval: 60000,
    })),
  });

  const clinicActive = activeHospital?.unitType === "clinic";
  const { data: questionnaireCount } = useQuery<{ count: number }>({
    queryKey: ["/api/questionnaire/unassociated/count"],
    enabled: clinicActive && !!activeHospital?.addonQuestionnaire,
    refetchInterval: 60000,
  });

  const leadsByHospitalId: Record<string, number> = {};
  clinicAlertHospitalIds.forEach((id, i) => {
    leadsByHospitalId[id] =
      (leadsQueries[i]?.data as { count?: number } | undefined)?.count ?? 0;
  });

  const surgeryAlertByHospitalId: Record<string, number> = {};
  surgeryAlertHospitalIds.forEach((id, i) => {
    const reqs =
      (surgeryRequestsQueries[i]?.data as { count?: number } | undefined)?.count ?? 0;
    const acts =
      (surgeonActionQueries[i]?.data as { count?: number } | undefined)?.count ?? 0;
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
