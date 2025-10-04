import { useLocation } from "wouter";

interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  // { id: "home", icon: "fas fa-home", label: "Home", path: "/" },
  { id: "items", icon: "fas fa-boxes", label: "Items", path: "/items" },
  { id: "orders", icon: "fas fa-file-invoice", label: "Orders", path: "/orders" },
  { id: "controlled", icon: "fas fa-shield-halved", label: "Controlled", path: "/controlled" },
  { id: "alerts", icon: "fas fa-bell", label: "Alerts", path: "/alerts" },
];

export default function BottomNav() {
  const [location, navigate] = useLocation();

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
