import { useModule } from "@/contexts/ModuleContext";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

interface ModuleCard {
  id: string;
  icon: string;
  title: string;
  description: string;
  route: string;
  color: string;
}

export default function ModuleDrawer() {
  const { isDrawerOpen, setIsDrawerOpen, activeModule } = useModule();
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  const modules: ModuleCard[] = [
    {
      id: "inventory",
      icon: "fas fa-boxes",
      title: t('modules.inventory.title'),
      description: t('modules.inventory.description'),
      route: "/items",
      color: "bg-blue-500",
    },
    {
      id: "anesthesia",
      icon: "fas fa-heartbeat",
      title: t('modules.anesthesia.title'),
      description: t('modules.anesthesia.description'),
      route: "/anesthesia/patients",
      color: "bg-red-500",
    },
  ];

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
