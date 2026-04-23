import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { clientSessionId } from "@/utils/sessionId";
import "@/utils/demoMode"; // Installs global fetch interceptor for demo-mode anonymisation

function getActiveHospitalAndUnit(): { hospitalId: string | null; unitId: string | null; role: string | null } {
  const activeHospitalKey = localStorage.getItem('activeHospital');
  if (!activeHospitalKey) return { hospitalId: null, unitId: null, role: null };
  
  // activeHospitalKey format: "hospitalId-unitId-role"
  // Since UUIDs contain hyphens, we need to parse carefully
  // UUIDs are 36 chars (including hyphens), role is at the end
  // Format: <36 chars>-<36 chars>-<role>
  
  if (activeHospitalKey.length < 73) return { hospitalId: null, unitId: null, role: null }; // At least 36 + 1 + 36 = 73 chars
  
  const hospitalId = activeHospitalKey.substring(0, 36);
  const unitId = activeHospitalKey.substring(37, 73);
  const role = activeHospitalKey.substring(74); // After the second hyphen
  
  return { hospitalId, unitId, role };
}

function getActiveUnitId(): string | null {
  return getActiveHospitalAndUnit().unitId;
}

async function throwIfResNotOk(res: Response, url?: string) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // Try to parse JSON error response and extract message
    let error: Error;
    try {
      const errorData = JSON.parse(text);
      if (errorData.message) {
        error = new Error(errorData.message);
      } else {
        error = new Error(`${res.status}: ${text}`);
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        error = new Error(`${res.status}: ${text}`);
      } else {
        throw e;
      }
    }
    
    // Sentry capture is handled globally by the fetch interceptor in main.tsx,
    // which covers raw fetch() callsites too. No per-request capture here.
    throw error;
  }
}

/** Parse JSON from a Response, applying demo-mode anonymisation when active.
 *  Note: the global fetch interceptor in demoMode.ts now handles the transform,
 *  so this is simply a typed res.json() wrapper. Kept for convenience. */
export async function demoJson<T = unknown>(res: Response): Promise<T> {
  return await res.json() as T;
}

/**
 * Options for `apiRequest`. `scope: "group"` adds an `X-Active-Scope: group`
 * header so the server widens reads to every hospital in the active group
 * (used by the patient-list "All locations" toggle). Omit or pass "hospital"
 * for the default single-location behaviour — the header is only sent when
 * `scope` is explicitly `"group"`.
 */
export interface ApiRequestOptions {
  scope?: "hospital" | "group";
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: ApiRequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};

  // Add active hospital, unit ID, and role headers if available
  const { hospitalId, unitId, role } = getActiveHospitalAndUnit();
  if (hospitalId) {
    headers["X-Active-Hospital-Id"] = hospitalId;
  }
  if (unitId) {
    headers["X-Active-Unit-Id"] = unitId;
  }
  if (role) {
    headers["X-Active-Role"] = role;
  }
  if (options?.scope === "group") {
    headers["X-Active-Scope"] = "group";
  }

  // Add client session ID for real-time sync filtering
  headers["X-Client-Session-Id"] = clientSessionId;

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res, `${method} ${url}`);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};

    // Add active hospital, unit ID, and role headers if available
    const { hospitalId, unitId, role } = getActiveHospitalAndUnit();
    if (hospitalId) {
      headers["X-Active-Hospital-Id"] = hospitalId;
    }
    if (unitId) {
      headers["X-Active-Unit-Id"] = unitId;
    }
    if (role) {
      headers["X-Active-Role"] = role;
    }

    // Derive the scope header from the query URL itself: a `?scope=group`
    // search param opts the request into the cross-location read (used by
    // the patient-list "All locations" toggle). Any other value is ignored
    // server-side; omitting the header keeps today's single-location
    // behaviour. Wrapping in try/catch so malformed URLs never break the
    // query function.
    const url = queryKey[0] as string;
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.searchParams.get("scope") === "group") {
        headers["X-Active-Scope"] = "group";
      }
    } catch {
      /* ignore — not a URL we can parse, skip scope detection. */
    }

    const res = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res, `GET ${queryKey[0]}`);
    // Demo-mode anonymisation is handled globally by the fetch interceptor in demoMode.ts
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
