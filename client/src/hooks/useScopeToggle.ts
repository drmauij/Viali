import { useEffect, useState } from "react";

/**
 * Shared scope toggle hook used by every "This clinic / All locations" surface
 * (Task 5 Patients, Task 11 business Dashboards, Task 12 Flows). The pattern
 * was duplicated across three pages so this centralises:
 *
 *   - URL sync: mirrors `?scope=group` ⇆ local state so the toggle is
 *     link-shareable and survives refresh. `?scope=hospital` (the default) is
 *     omitted from the URL to keep the default path clean.
 *   - Initial read: on mount, reads the URL param to pre-fill state.
 *   - Defensive collapse: if the consumer decides the toggle should not be
 *     available (e.g. un-grouped tenant, user lost group_admin), `available`
 *     is set to `false` and the hook forces `scope = "hospital"` and stops
 *     writing `?scope=group` to the URL. Prevents stale params from surviving
 *     a hospital switch.
 *
 * @param opts.available When `false` the hook always returns `"hospital"` and
 *                       ignores/clears any URL param. Default `true`.
 */
export function useScopeToggle(opts?: { available?: boolean }): {
  scope: "hospital" | "group";
  setScope: (s: "hospital" | "group") => void;
} {
  const available = opts?.available ?? true;

  // Initial state derives from the URL so a shared link like
  // `/business/flows?scope=group` opens in "All locations" view immediately.
  const [scope, setScope] = useState<"hospital" | "group">(() => {
    if (typeof window === "undefined") return "hospital";
    const params = new URLSearchParams(window.location.search);
    return params.get("scope") === "group" ? "group" : "hospital";
  });

  // Keep the URL in sync with state — using `replaceState` so toggle clicks
  // don't pollute browser history with a new stack entry per click.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const current = params.get("scope");
    if (scope === "group" && current !== "group") {
      params.set("scope", "group");
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    } else if (scope === "hospital" && current === "group") {
      params.delete("scope");
      const qs = params.toString();
      window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
  }, [scope]);

  // If the consumer withdraws availability (e.g. hospital lost its group,
  // user lost group_admin), collapse to hospital scope so we don't keep
  // sending a stale `?scope=group` param on subsequent queries.
  useEffect(() => {
    if (!available && scope === "group") {
      setScope("hospital");
    }
  }, [available, scope]);

  if (!available) {
    return { scope: "hospital", setScope: () => {} };
  }
  return { scope, setScope };
}
