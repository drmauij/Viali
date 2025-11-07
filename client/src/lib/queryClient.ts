import { QueryClient, QueryFunction } from "@tanstack/react-query";

function getActiveUnitId(): string | null {
  const activeHospitalKey = localStorage.getItem('activeHospital');
  if (!activeHospitalKey) return null;
  
  // activeHospitalKey format: "hospitalId-unitId-role"
  // Since UUIDs contain hyphens, we need to parse carefully
  // UUIDs are 36 chars (including hyphens), role is at the end
  // Format: <36 chars>-<36 chars>-<role>
  
  if (activeHospitalKey.length < 73) return null; // At least 36 + 1 + 36 = 73 chars
  
  const hospitalId = activeHospitalKey.substring(0, 36);
  const unitId = activeHospitalKey.substring(37, 73);
  
  return unitId;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // Try to parse JSON error response and extract message
    try {
      const errorData = JSON.parse(text);
      if (errorData.message) {
        throw new Error(errorData.message);
      }
      // If JSON but no message field, use full format
      throw new Error(`${res.status}: ${text}`);
    } catch (e) {
      // If not valid JSON, check if error is from JSON.parse
      if (e instanceof SyntaxError) {
        // Not JSON, use full format
        throw new Error(`${res.status}: ${text}`);
      }
      // Otherwise it's the error we threw above, re-throw it
      throw e;
    }
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  // Add active unit ID header if available
  const activeUnitId = getActiveUnitId();
  if (activeUnitId) {
    headers["X-Active-Unit-Id"] = activeUnitId;
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    
    // Add active unit ID header if available
    const activeUnitId = getActiveUnitId();
    if (activeUnitId) {
      headers["X-Active-Unit-Id"] = activeUnitId;
    }
    
    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
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
