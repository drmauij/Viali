import { Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAnesthesia?: boolean;
  requireSurgery?: boolean;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ 
  children, 
  requireAnesthesia, 
  requireSurgery,
  requireAdmin 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const activeHospital = useActiveHospital();

  // Module access is based on the ACTIVE unit selection
  // When user switches units, available modules change accordingly
  const hasAnesthesiaAccess = activeHospital?.isAnesthesiaModule === true;
  const hasSurgeryAccess = activeHospital?.isSurgeryModule === true;
  const hasAdminAccess = activeHospital?.role === "admin";

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

  // Check anesthesia module access - active unit must be anesthesia module
  if (requireAnesthesia && !hasAnesthesiaAccess) {
    return <Redirect to="/inventory/items" />;
  }

  // Check surgery module access - active unit must be surgery module
  if (requireSurgery && !hasSurgeryAccess) {
    return <Redirect to="/inventory/items" />;
  }

  // Check admin access - active unit role must be admin
  if (requireAdmin && !hasAdminAccess) {
    return <Redirect to="/inventory/items" />;
  }

  return <>{children}</>;
}
