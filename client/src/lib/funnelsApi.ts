export type FunnelsScope = { hospitalIds: string[]; groupId?: string };

/**
 * Builds an API URL for a funnels-related resource that exists in two
 * forms: per-hospital (`/api/business/:hospitalId/<resource>`) and chain
 * (`/api/chain/:groupId/<resource>`). When `scope.groupId` is set, the
 * chain URL is returned with `hospitalIds` baked into the query string.
 */
export function funnelsUrl(
  resource: string,
  scope: FunnelsScope,
  params?: Record<string, string | number | undefined>,
): string {
  const qs = new URLSearchParams();
  if (scope.groupId) {
    qs.set("hospitalIds", scope.hospitalIds.join(","));
  }
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && String(v).length > 0) qs.set(k, String(v));
  }
  const queryStr = qs.toString();
  if (scope.groupId) {
    return `/api/chain/${scope.groupId}/${resource}${queryStr ? `?${queryStr}` : ""}`;
  }
  return `/api/business/${scope.hospitalIds[0] ?? ""}/${resource}${queryStr ? `?${queryStr}` : ""}`;
}
