import { useModule } from "@/contexts/ModuleContext";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import { Copy, Check, Link as LinkIcon, FileText, Clock, Calendar, ClipboardCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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
  const { addons } = useHospitalAddons();
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
  const hasAnesthesiaAccess = activeHospital?.unitType === 'anesthesia';
  const hasSurgeryAccess = activeHospital?.unitType === 'or';
  const hasBusinessAccess = activeHospital?.unitType === 'business';
  const hasClinicAccess = activeHospital?.unitType === 'clinic';
  const hasLogisticAccess = activeHospital?.unitType === 'logistic';
  const isAdmin = activeHospital?.role === "admin";
  const canAccessPreOp = activeHospital?.role === "admin" || activeHospital?.role === "doctor";

  const { data: pendingCountData } = useQuery<{ count: number }>({
    queryKey: [`/api/checklists/count/${activeHospital?.id}?unitId=${activeHospital?.unitId}`],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId,
    refetchInterval: 30000,
  });

  const hasPendingChecklists = (pendingCountData?.count || 0) > 0;

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
    // Clinic module only for users assigned to clinic units AND addon enabled
    if (module.clinicOnly && (!hasClinicAccess || !addons.clinic)) return false;
    // Logistic module only for users assigned to logistic units AND addon enabled
    if (module.logisticOnly && (!hasLogisticAccess || !addons.logistics)) return false;
    // Anesthesia module only for anesthesia staff (assigned to anesthesia unit)
    if (module.id === "anesthesia" && !hasAnesthesiaAccess) return false;
    // Surgery module only for OR staff (assigned to surgery unit) AND addon enabled
    if (module.id === "surgery" && (!hasSurgeryAccess || !addons.surgery)) return false;
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
    
    // Clinic questionnaire link (if hospital has a questionnaire token and questionnaire addon is enabled)
    if (activeHospital?.questionnaireToken && addons.questionnaire) {
      links.push({
        id: 'questionnaire',
        icon: <FileText className="w-4 h-4" />,
        label: t('quickLinks.clinicQuestionnaire'),
        url: `${baseUrl}/questionnaire/hospital/${activeHospital.questionnaireToken}`,
      });
    }

    // External surgery reservation link (if hospital has the token configured)
    if (activeHospital?.externalSurgeryToken && (hasSurgeryAccess || hasAnesthesiaAccess)) {
      links.push({
        id: 'externalSurgery',
        icon: <Calendar className="w-4 h-4" />,
        label: t('quickLinks.externalSurgery', 'OP-Terminreservierung'),
        url: `${baseUrl}/external-surgery/${activeHospital.externalSurgeryToken}`,
      });
    }
    
    return links;
  }, [activeHospital, addons.questionnaire, hasSurgeryAccess, hasAnesthesiaAccess, t]);

  // Menu items for navigation (shown in drawer, not as copy links)
  const menuItems = useMemo(() => {
    const items: { id: string; icon: JSX.Element; label: string; route: string; badge?: number }[] = [];
    
    // Worklogs links - only show if worktime addon is enabled
    // Show separate links if user has access to both modules
    // Otherwise show single link for the module they have access to
    if (addons.worktime) {
      if (hasAnesthesiaAccess && hasSurgeryAccess) {
        // User has both - show separate options
        items.push({
          id: 'worklogs-anesthesia',
          icon: <Clock className="w-4 h-4" />,
          label: t('quickLinks.worklogsAnesthesia', 'Arbeitszeitnachweise (Anästhesie)'),
          route: '/anesthesia/worklogs',
        });
        items.push({
          id: 'worklogs-surgery',
          icon: <Clock className="w-4 h-4" />,
          label: t('quickLinks.worklogsSurgery', 'Arbeitszeitnachweise (Chirurgie)'),
          route: '/surgery/worklogs',
        });
      } else if (hasAnesthesiaAccess) {
        items.push({
          id: 'worklogs',
          icon: <Clock className="w-4 h-4" />,
          label: t('quickLinks.worklogs', 'Arbeitszeitnachweise'),
          route: '/anesthesia/worklogs',
        });
      } else if (hasSurgeryAccess) {
        items.push({
          id: 'worklogs',
          icon: <Clock className="w-4 h-4" />,
          label: t('quickLinks.worklogs', 'Arbeitszeitnachweise'),
          route: '/surgery/worklogs',
        });
      }
    }
    
    const showSurgeryChecklists = hasSurgeryAccess && canAccessPreOp && addons.surgery;
    if (showSurgeryChecklists || hasPendingChecklists) {
      const checklistRoute = showSurgeryChecklists ? '/surgery/checklists' : '/inventory/checklists';
      items.push({
        id: 'checklists',
        icon: <ClipboardCheck className="w-4 h-4" />,
        label: t('bottomNav.checklists', 'Checklists'),
        route: checklistRoute,
        ...(hasPendingChecklists ? { badge: pendingCountData?.count } : {}),
      });
    }

    return items;
  }, [addons.worktime, addons.surgery, hasAnesthesiaAccess, hasSurgeryAccess, canAccessPreOp, hasPendingChecklists, pendingCountData?.count, t]);

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
        className="fixed top-0 left-0 right-0 bg-background border-b border-border z-50 shadow-lg animate-in slide-in-from-top duration-300 max-h-[85vh] overflow-y-auto"
        data-testid="module-drawer"
      >
        <div className="max-w-4xl mx-auto p-6 pb-8">
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

          {/* Menu Items Section (navigation links) */}
          {menuItems.length > 0 && (
            <div className={quickLinks.length > 0 ? "mt-4" : "mt-6 pt-6 border-t border-border"}>
              {quickLinks.length === 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <LinkIcon className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">{t('quickLinks.moreOptions', 'More Options')}</h3>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleModuleClick(item.route)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                    data-testid={`menu-item-${item.id}`}
                  >
                    <div className="relative w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {item.icon}
                      {item.badge && item.badge > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
