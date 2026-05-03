import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import type { User } from "@shared/schema";

/**
 * The /api/auth/user endpoint returns the sanitized User row plus a few
 * computed fields (see server/routes/auth.ts). Keep this in sync with the
 * response shape so callers don't need to reach for `as any` casts.
 */
export type AuthUser = Omit<User, "passwordHash" | "kioskPinHash"> & {
  hasKioskPin: boolean;
  hospitals: unknown[];
  mustChangePassword: boolean;
  isPlatformAdmin: boolean;
};

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email || undefined });
    } else if (!isLoading) {
      Sentry.setUser(null);
    }
  }, [user, isLoading]);

  return {
    user,
    isLoading: isLoading && !error,
    isAuthenticated: !!user,
  };
}
