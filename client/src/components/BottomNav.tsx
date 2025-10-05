import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";

interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  adminOnly?: boolean;
}

const baseNavItems: NavItem[] = [
  { id: "items", icon: "fas fa-boxes", label: "Items", path: "/items" },
  { id: "orders", icon: "fas fa-file-invoice", label: "Orders", path: "/orders" },
  { id: "controlled", icon: "fas fa-shield-halved", label: "Controlled", path: "/controlled" },
  { id: "admin", icon: "fas fa-user-shield", label: "Admin", path: "/admin", adminOnly: true },
];

export default function BottomNav() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();

  const activeHospital = useMemo(() => {
    return (user as any)?.hospitals?.[0];
  }, [user]);

  const isAdmin = activeHospital?.role === "admin";

  const navItems = useMemo(() => {
    return baseNavItems.filter(item => !item.adminOnly || isAdmin);
  }, [isAdmin]);

  const isActive = (path: string) => {
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
