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
  // Cross-tenant platform admin (users.is_platform_admin). Independent of the
  // active hospital selection — used for /platform/* routes. Gate for Viali
  // operator tools.
  requirePlatformAdmin?: boolean;
  // Chain admin: the user must have a `group_admin` role row somewhere AND
  // the active hospital must be part of a group. Used by the /chain/* module.
  // The server is authoritative — this flag is UX so chain-admin surfaces
  // don't flash for users who can't reach them. Platform admins bypass (they
  // can reach any chain tool from /platform/*).
  requireChain?: boolean;
  // Alias of requirePlatformAdmin for symmetry with requireChain. Routes on
  // /platform/* should use requirePlatform — semantically clearer and lets us
  // add platform-scoped logic later without touching the platform-admin
  // column in users.
  requirePlatform?: boolean;
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
  requireChain,
  requirePlatform,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const activeHospital = useActiveHospital();

  // Module access is based strictly on the ACTIVE unit selection. Chain
  // admins reach single-clinic modules via their auto-provisioned admin
  // role rows (one per hospital in the group); they don't get a bypass
  // here. This removes an entire class of widening patches that the old
  // /admin mix-up required.
  const hasAnesthesiaAccess = activeHospital?.unitType === 'anesthesia';
  const hasSurgeryAccess = activeHospital?.unitType === 'or';
  // group_admin = full admin rights at every member clinic in the chain.
  const hasAdminAccess = activeHospital?.role === "admin" || activeHospital?.role === "group_admin";
  const hasDoctorAccess = activeHospital?.role === "doctor";
  const hasBusinessAccess = activeHospital?.unitType === 'business';
  const hasClinicAccess = activeHospital?.unitType === 'clinic';
  const hasLogisticAccess = activeHospital?.unitType === 'logistic';

  // Default redirect when a route gate fails: pick a landing the user
  // definitely has access to based on the active unit's role/type.
  const getDefaultRedirect = (): string => {
    if (hasBusinessAccess) {
      return activeHospital?.role === 'marketing' ? "/business/funnels" : "/business";
    }
    if (hasAnesthesiaAccess) return "/anesthesia/op";
    if (hasSurgeryAccess) return "/surgery/op";
    if (hasClinicAccess) return "/clinic";
    if (hasLogisticAccess) return "/logistic/inventory";
    return "/inventory/items";
  };

  // Loading gate — auth still resolving or user data not attached yet.
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

  // Platform-admin routes exist independently of any active hospital — a
  // Viali operator can land here regardless of their per-clinic roles.
  if (requirePlatformAdmin || requirePlatform) {
    if (!(user as any)?.isPlatformAdmin) {
      return <Redirect to="/" />;
    }
    return <>{children}</>;
  }

  // All subsequent gates require hospital data (roles depend on it).
  const userHospitals = (user as any)?.hospitals;
  if (!userHospitals || userHospitals.length === 0) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" data-testid="loading-spinner" />
      </div>
    );
  }

  const defaultRedirect = getDefaultRedirect();

  if (requireAnesthesia && !hasAnesthesiaAccess) return <Redirect to={defaultRedirect} />;
  if (requireSurgery && !hasSurgeryAccess) return <Redirect to={defaultRedirect} />;
  if (requireAdmin && !hasAdminAccess) return <Redirect to={defaultRedirect} />;
  if (requireBusiness && !hasBusinessAccess) return <Redirect to={defaultRedirect} />;

  // Marketing role can only access /business/funnels.
  if (requireBusiness && hasBusinessAccess && activeHospital?.role === 'marketing') {
    const currentPath = window.location.pathname;
    if (currentPath !== '/business/funnels') {
      return <Redirect to="/business/funnels" />;
    }
  }

  if (requireClinic && !hasClinicAccess) return <Redirect to={defaultRedirect} />;
  if (requireLogistic && !hasLogisticAccess) return <Redirect to={defaultRedirect} />;
  if (requireDoctorOrAdmin && !hasDoctorAccess && !hasAdminAccess) return <Redirect to={defaultRedirect} />;

  // Chain gate: user has a group_admin row somewhere AND active hospital
  // belongs to a group. Platform admins bypass (they reach chain surfaces
  // from /platform).
  if (requireChain) {
    const isPlatformAdmin = !!(user as any)?.isPlatformAdmin;
    const hasChainAdminRole = isPlatformAdmin ||
      userHospitals.some((h: any) => h.role === "group_admin");
    const activeHasGroup = !!(activeHospital as any)?.groupId;
    if (!hasChainAdminRole || !activeHasGroup) {
      return <Redirect to={defaultRedirect} />;
    }
  }

  return <>{children}</>;
}
