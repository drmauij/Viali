import { useModule } from "@/contexts/ModuleContext";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Link as LinkIcon, FileText, Clock } from "lucide-react";

interface ModuleCard {
  id: string;
  icon: string;
  title: string;
  description: string;
  route: string;
  color: string;
  adminOnly?: boolean;
  businessOnly?: boolean;
  clinicOnly?: boolean;
  logisticOnly?: boolean;
}

export default function ModuleDrawer() {
  const { isDrawerOpen, setIsDrawerOpen, activeModule } = useModule();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Get the active hospital for module access checks
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

  // Module access is based on the ACTIVE unit selection
  // When user switches units, available modules change accordingly
  const hasAnesthesiaAccess = activeHospital?.isAnesthesiaModule === true;
  const hasSurgeryAccess = activeHospital?.isSurgeryModule === true;
  const hasBusinessAccess = activeHospital?.isBusinessModule === true;
  const hasClinicAccess = activeHospital?.isClinicModule === true;
  const hasLogisticAccess = activeHospital?.isLogisticModule === true;
  const isAdmin = activeHospital?.role === "admin";

  const allModules: ModuleCard[] = [
    {
      id: "anesthesia",
      icon: "fas fa-heartbeat",
      title: t('modules.anesthesia.title'),
      description: t('modules.anesthesia.description'),
      route: "/anesthesia/op",
      color: "bg-red-500",
    },
    {
      id: "surgery",
      icon: "fas fa-user-nurse",
      title: t('modules.surgery.title'),
      description: t('modules.surgery.description'),
      route: "/surgery/op",
      color: "bg-teal-500",
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
      id: "business",
      icon: "fas fa-chart-line",
      title: t('modules.business.title'),
      description: t('modules.business.description'),
      route: "/business",
      color: "bg-amber-500",
      businessOnly: true,
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
    {
      id: "clinic",
      icon: "fas fa-hospital-user",
      title: t('modules.clinic.title'),
      description: t('modules.clinic.description'),
      route: "/clinic",
      color: "bg-emerald-500",
      clinicOnly: true,
    },
    {
      id: "logistic",
      icon: "fas fa-truck-loading",
      title: t('modules.logistic.title'),
      description: t('modules.logistic.description'),
      route: "/logistic/inventory",
      color: "bg-orange-500",
      logisticOnly: true,
    },
  ];

  // Check unit-level UI visibility flags (default to true if not set)
  const showInventory = activeHospital?.showInventory !== false;
  const showAppointments = activeHospital?.showAppointments !== false;

  // Business-only users (manager role in business unit without anesthesia/surgery access)
  // should only see the Business module (legacy fallback)
  const isBusinessOnly = hasBusinessAccess && !hasAnesthesiaAccess && !hasSurgeryAccess && !isAdmin;

  const modules = allModules.filter(module => {
    // Admin modules only for admins
    if (module.adminOnly && !isAdmin) return false;
    // Business module only for users assigned to business units
    if (module.businessOnly && !hasBusinessAccess) return false;
    // Clinic module only for users assigned to clinic units
    if (module.clinicOnly && !hasClinicAccess) return false;
    // Logistic module only for users assigned to logistic units
    if (module.logisticOnly && !hasLogisticAccess) return false;
    // Anesthesia module only for anesthesia staff (assigned to anesthesia unit)
    if (module.id === "anesthesia" && !hasAnesthesiaAccess) return false;
    // Surgery module only for OR staff (assigned to surgery unit)
    if (module.id === "surgery" && !hasSurgeryAccess) return false;
    // Hide Inventory based on unit showInventory flag, legacy isBusinessOnly check, or logistic units (they have their own inventory view)
    if (module.id === "inventory" && (!showInventory || isBusinessOnly || hasLogisticAccess)) return false;
    return true;
  });

  const handleModuleClick = (route: string) => {
    navigate(route);
    setIsDrawerOpen(false);
  };

  const copyToClipboard = async (url: string, linkId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(linkId);
      toast({
        title: t('quickLinks.copied'),
        description: t('quickLinks.copiedDesc'),
      });
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('quickLinks.copyFailed'),
        variant: 'destructive',
      });
    }
  };

  // Generate quick links based on hospital configuration
  const quickLinks = useMemo(() => {
    const links: { id: string; icon: JSX.Element; label: string; url: string; isRoute?: boolean }[] = [];
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    
    // Clinic questionnaire link (if hospital has a questionnaire token)
    if (activeHospital?.questionnaireToken) {
      links.push({
        id: 'questionnaire',
        icon: <FileText className="w-4 h-4" />,
        label: t('quickLinks.clinicQuestionnaire'),
        url: `${baseUrl}/questionnaire/hospital/${activeHospital.questionnaireToken}`,
      });
    }
    
    return links;
  }, [activeHospital, t]);

  // Menu items for navigation (shown in drawer, not as copy links)
  const menuItems = useMemo(() => {
    const items: { id: string; icon: JSX.Element; label: string; route: string }[] = [];
    
    // Worklogs link - available for anesthesia and surgery module users
    if (hasAnesthesiaAccess || hasSurgeryAccess) {
      const worklogRoute = activeModule === 'surgery' ? '/surgery/worklogs' : '/anesthesia/worklogs';
      items.push({
        id: 'worklogs',
        icon: <Clock className="w-4 h-4" />,
        label: t('quickLinks.worklogs', 'Arbeitszeitnachweise'),
        route: worklogRoute,
      });
    }
    
    return items;
  }, [hasAnesthesiaAccess, hasSurgeryAccess, activeModule, t]);

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
                      {module.id === "business" && (
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

          {/* Menu Items Section (navigation links) */}
          {menuItems.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center gap-2 mb-4">
                <LinkIcon className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">{t('quickLinks.moreOptions', 'Weitere Optionen')}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleModuleClick(item.route)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                    data-testid={`menu-item-${item.id}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {item.icon}
                    </div>
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Links Section */}
          {quickLinks.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center gap-2 mb-4">
                <LinkIcon className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">{t('quickLinks.title')}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {quickLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                    data-testid={`quick-link-${link.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        {link.icon}
                      </div>
                      <span className="text-sm font-medium text-foreground">{link.label}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(link.url, link.id)}
                      className="p-2 rounded-lg hover:bg-background transition-colors"
                      title={t('quickLinks.copyLink')}
                      data-testid={`copy-link-${link.id}`}
                    >
                      {copiedLink === link.id ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('quickLinks.description')}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
