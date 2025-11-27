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
  const { isAuthenticated, isLoading } = useAuth();
  const activeHospital = useActiveHospital();

  // Module access is based on the ACTIVE unit selection
  // When user switches units, available modules change accordingly
  const hasAnesthesiaAccess = activeHospital?.isAnesthesiaModule === true;
  const hasSurgeryAccess = activeHospital?.isSurgeryModule === true;
  const hasAdminAccess = activeHospital?.role === "admin";

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" data-testid="loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/" />;
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
