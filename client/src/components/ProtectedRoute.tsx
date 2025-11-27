import { useMemo } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";

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

  // Check if user has access to any hospital with the required module/role
  // This prevents bypassing by switching active hospital in localStorage
  const userHospitals = (user as any)?.hospitals || [];

  const hasAnesthesiaAccess = useMemo(() => {
    return userHospitals.some((h: any) => h.isAnesthesiaModule === true);
  }, [userHospitals]);

  const hasSurgeryAccess = useMemo(() => {
    return userHospitals.some((h: any) => h.isSurgeryModule === true);
  }, [userHospitals]);

  const hasAdminAccess = useMemo(() => {
    return userHospitals.some((h: any) => h.role === "admin");
  }, [userHospitals]);

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

  // Check anesthesia module access - user must be assigned to an anesthesia unit
  if (requireAnesthesia && !hasAnesthesiaAccess) {
    return <Redirect to="/inventory/items" />;
  }

  // Check surgery module access - user must be assigned to a surgery unit
  if (requireSurgery && !hasSurgeryAccess) {
    return <Redirect to="/inventory/items" />;
  }

  // Check admin access - user must have admin role in at least one hospital
  if (requireAdmin && !hasAdminAccess) {
    return <Redirect to="/inventory/items" />;
  }

  return <>{children}</>;
}
