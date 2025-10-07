import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  adminOnly?: boolean;
}

export default function BottomNav() {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { user } = useAuth();

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    // Try to get active hospital from localStorage
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.locationId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    // Default to first hospital
    return userHospitals[0];
  }, [user]);

  const isAdmin = activeHospital?.role === "admin";

  const navItems: NavItem[] = useMemo(() => {
    const items = [
      { id: "items", icon: "fas fa-boxes", label: t('bottomNav.items'), path: "/items" },
      { id: "orders", icon: "fas fa-file-invoice", label: t('bottomNav.orders'), path: "/orders" },
      { id: "controlled", icon: "fas fa-shield-halved", label: t('bottomNav.controlled'), path: "/controlled" },
      { id: "admin", icon: "fas fa-user-shield", label: t('bottomNav.admin'), path: "/admin", adminOnly: true },
    ];
    return items.filter(item => !item.adminOnly || isAdmin);
  }, [t, isAdmin]);

  const isActive = (path: string) => {
    if (path === "/items") {
      return location === "/" || location.startsWith("/items");
    }
    if (path === "/") {
      return location === "/";
    }
    return location.startsWith(path);
  };

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${isActive(item.path) ? "active" : ""}`}
          onClick={() => navigate(item.path)}
          data-testid={`nav-${item.id}`}
        >
          <i className={item.icon}></i>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
