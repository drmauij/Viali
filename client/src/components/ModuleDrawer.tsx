import { useModule } from "@/contexts/ModuleContext";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";

interface ModuleCard {
  id: string;
  icon: string;
  title: string;
  description: string;
  route: string;
  color: string;
  adminOnly?: boolean;
}

export default function ModuleDrawer() {
  const { isDrawerOpen, setIsDrawerOpen, activeModule } = useModule();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    return userHospitals[0];
  }, [user]);

  const isAdmin = activeHospital?.role === "admin";

  const allModules: ModuleCard[] = [
    {
      id: "anesthesia",
      icon: "fas fa-heartbeat",
      title: t('modules.anesthesia.title'),
      description: t('modules.anesthesia.description'),
      route: "/anesthesia/patients",
      color: "bg-red-500",
    },
    {
      id: "inventory",
      icon: "fas fa-boxes",
      title: t('modules.inventory.title'),
      description: t('modules.inventory.description'),
      route: "/inventory/items",
      color: "bg-blue-500",
    },
    {
      id: "admin",
      icon: "fas fa-user-shield",
      title: t('modules.admin.title'),
      description: t('modules.admin.description'),
      route: "/admin",
      color: "bg-purple-500",
      adminOnly: true,
    },
  ];

  // Check if user has access to anesthesia module
  const hasAnesthesiaAccess = useMemo(() => {
    if (!activeHospital?.anesthesiaUnitId) return false;
    return activeHospital.unitId === activeHospital.anesthesiaUnitId;
  }, [activeHospital]);

  const modules = allModules.filter(module => {
    // Admin modules only for admins
    if (module.adminOnly && !isAdmin) return false;
    // Anesthesia module only if configured and user has access
    if (module.id === "anesthesia" && !hasAnesthesiaAccess) return false;
    return true;
  });

  const handleModuleClick = (route: string) => {
    navigate(route);
    setIsDrawerOpen(false);
  };

  if (!isDrawerOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={() => setIsDrawerOpen(false)}
        data-testid="module-drawer-backdrop"
      />

      {/* Drawer */}
      <div
        className="fixed top-0 left-0 right-0 bg-background border-b border-border z-50 shadow-lg animate-in slide-in-from-top duration-300"
        data-testid="module-drawer"
      >
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-foreground">{t('modules.title')}</h2>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
              data-testid="close-drawer-button"
            >
              <i className="fas fa-times text-muted-foreground"></i>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modules.map((module) => (
              <button
                key={module.id}
                onClick={() => handleModuleClick(module.route)}
                className={`p-6 rounded-lg border-2 transition-all text-left ${
                  activeModule === module.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-accent"
                }`}
                data-testid={`module-card-${module.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg ${module.color} flex items-center justify-center flex-shrink-0`}>
                    <i className={`${module.icon} text-xl text-white`}></i>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-foreground mb-1">
                      {module.title}
                      {activeModule === module.id && (
                        <span className="ml-2 text-xs text-primary">
                          <i className="fas fa-check-circle"></i> {t('modules.active')}
                        </span>
                      )}
                      {module.id === "anesthesia" && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-700">
                          <i className="fas fa-flask mr-1 text-[10px]"></i>
                          POC / In Development
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground">{module.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
