export type FunnelsScope = { hospitalIds: string[]; groupId?: string };

/**
 * Builds an API URL for a funnels-related resource that exists in two
 * forms: per-hospital (`/api/business/:hospitalId/<resource>`) and chain
 * (`/api/chain/:groupId/<resource>`). When `scope.groupId` is set, the
 * chain URL is returned with `hospitalIds` baked into the query string.
 *
 * Returns `null` when the scope can't address a real resource (clinic
 * mode with no hospitalId, chain mode with no hospitalIds). Callers
 * should pair the result with `useQuery({ enabled: !!url })` so an
 * unaddressable scope skips the fetch entirely instead of issuing a
 * malformed request like `/api/business//leads`.
 */
export function funnelsUrl(
  resource: string,
  scope: FunnelsScope,
  params?: Record<string, string | number | undefined>,
): string | null {
  if (scope.groupId) {
    if (scope.hospitalIds.length === 0) return null;
  } else {
    if (!scope.hospitalIds[0]) return null;
  }

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
  return `/api/business/${scope.hospitalIds[0]}/${resource}${queryStr ? `?${queryStr}` : ""}`;
}
