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
  requireDoctorOrAdmin?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requireAnesthesia, 
  requireSurgery,
  requireAdmin,
  requireBusiness,
  requireClinic,
  requireDoctorOrAdmin
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const activeHospital = useActiveHospital();

  // Module access is based on the ACTIVE unit selection
  // When user switches units, available modules change accordingly
  const hasAnesthesiaAccess = activeHospital?.isAnesthesiaModule === true;
  const hasSurgeryAccess = activeHospital?.isSurgeryModule === true;
  const hasAdminAccess = activeHospital?.role === "admin";
  const hasDoctorAccess = activeHospital?.role === "doctor";
  const hasBusinessAccess = activeHospital?.isBusinessModule === true;
  const hasClinicAccess = activeHospital?.isClinicModule === true;

  // Determine the default redirect path based on active unit's module
  const getDefaultRedirect = (): string => {
    if (hasBusinessAccess) {
      return "/business";
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

  // Check clinic module access - active unit must be clinic module
  if (requireClinic && !hasClinicAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  // Check doctor or admin role access
  if (requireDoctorOrAdmin && !hasDoctorAccess && !hasAdminAccess) {
    return <Redirect to={defaultRedirect} />;
  }

  return <>{children}</>;
}
