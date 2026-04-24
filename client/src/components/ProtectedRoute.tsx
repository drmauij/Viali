import { Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAnesthesia?: boolean;
  requireSurgery?: boolean;
  requireAdmin?: boolean;
  requireBusiness?: boolean;
  requireClinic?: boolean;
  requireLogistic?: boolean;
  requireDoctorOrAdmin?: boolean;
  // Cross-tenant platform admin (users.is_platform_admin). Independent of
  // the active hospital selection — used for /admin/groups and similar
  // platform-wide surfaces.
  requirePlatformAdmin?: boolean;
  // Group admin: the user must have a `group_admin` role row AND the active
  // hospital must be part of a group. Used by `/business/group` (Task 13).
  // The SERVER is authoritative — this flag is UX so group-admin surfaces
  // don't flash for users who can't reach them.
  requireGroupAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireAnesthesia,
  requireSurgery,
  requireAdmin,
  requireBusiness,
  requireClinic,
  requireLogistic,
  requireDoctorOrAdmin,
  requirePlatformAdmin,
  requireGroupAdmin
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const activeHospital = useActiveHospital();

  // group_admin anywhere OR platform admin: chain-wide operators bypass
  // module-type gates because their role isn't bound to a specific unit.
  // (A group admin's job spans business AND clinic AND admin modules.)
  const chainAdminHospitals = (user as any)?.hospitals ?? [];
  const isChainAdmin =
    (user as any)?.isPlatformAdmin ||
    chainAdminHospitals.some((h: any) => h.role === "group_admin");

  // Module access is based on the ACTIVE unit selection
  // When user switches units, available modules change accordingly
  const hasAnesthesiaAccess =
    activeHospital?.unitType === 'anesthesia' || isChainAdmin;
  const hasSurgeryAccess =
    activeHospital?.unitType === 'or' || isChainAdmin;
  // group_admin is admin-equivalent for module gating (matching the same
  // widening applied in ModuleDrawer / BottomNav). Server gates remain
  // authoritative; this is UX access so group admins can actually reach
  // the admin pages they have permission for.
  const hasAdminAccess =
    activeHospital?.role === "admin" ||
    activeHospital?.role === "group_admin" ||
    isChainAdmin;
  const hasDoctorAccess = activeHospital?.role === "doctor";
  const hasBusinessAccess =
    activeHospital?.unitType === 'business' || isChainAdmin;
  const hasClinicAccess =
    activeHospital?.unitType === 'clinic' || isChainAdmin;
  const hasLogisticAccess =
    activeHospital?.unitType === 'logistic' || isChainAdmin;

  // Determine the default redirect path based on active unit's module
  const getDefaultRedirect = (): string => {
    if (hasBusinessAccess) {
      return activeHospital?.role === 'marketing' ? "/business/funnels" : "/business";
    }
    if (hasAnesthesiaAccess) {
      return "/anesthesia/op";
    }
    if (hasSurgeryAccess) {
      return "/surgery/op";
    }
    if (hasClinicAccess) {
      return "/clinic";
    }
    if (hasLogisticAccess) {
      return "/logistic/inventory";
    }
    // Default fallback for inventory/standard units
    return "/inventory/items";
  };

  // Show loading while auth is loading or user data isn't available yet
  if (isLoading || (isAuthenticated && !user)) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" data-testid="loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/" />;
  }

  // Platform-admin routes bypass the per-hospital gate: they exist independently
  // of the active-hospital selection. Non-platform-admins get redirected home.
  if (requirePlatformAdmin) {
    if (!(user as any)?.isPlatformAdmin) {
      return <Redirect to="/" />;
    }
    return <>{children}</>;
  }

  // Wait for hospital data to be available before checking module access
  const userHospitals = (user as any)?.hospitals;
  if (!userHospitals || userHospitals.length === 0) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" data-testid="loading-spinner" />
      </div>
    );
  }

  const defaultRedirect = getDefaultRedirect();

  // Check anesthesia module access - active unit must be anesthesia module
  if (requireAnesthesia && !hasAnesthesiaAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  // Check surgery module access - active unit must be surgery module
  if (requireSurgery && !hasSurgeryAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  // Check admin access - active unit role must be admin
  if (requireAdmin && !hasAdminAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  // Check business module access - active unit must be business module
  if (requireBusiness && !hasBusinessAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  // Marketing role can only access /business/funnels
  if (requireBusiness && hasBusinessAccess && activeHospital?.role === 'marketing') {
    const currentPath = window.location.pathname;
    if (currentPath !== '/business/funnels') {
      return <Redirect to="/business/funnels" />;
    }
  }

  // Check clinic module access - active unit must be clinic module
  if (requireClinic && !hasClinicAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  // Check logistic module access - active unit must be logistic module
  if (requireLogistic && !hasLogisticAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  // Check doctor or admin role access
  if (requireDoctorOrAdmin && !hasDoctorAccess && !hasAdminAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  // Group-admin gate (Task 13). Relies on the server-side role rows that
  // `GET /api/auth/user` already attaches to each hospital in `user.hospitals`.
  // A user is a group admin if they have any `group_admin` row AND the
  // active hospital has a `groupId`. Platform admins bypass this check.
  if (requireGroupAdmin) {
    const hasGroupAdminRole =
      (user as any)?.isPlatformAdmin ||
      userHospitals.some((h: any) => h.role === "group_admin");
    const activeHasGroup = !!(activeHospital as any)?.groupId;
    if (!hasGroupAdminRole || !activeHasGroup) {
      return <Redirect to={defaultRedirect} />;
    }
  }

  return <>{children}</>;
}
