import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Network, Globe, ClipboardCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SidebarTree } from "./SidebarTree";
import { SidebarQuickLinks } from "./SidebarQuickLinks";
import { SimpleHospitalPicker } from "./SimpleHospitalPicker";
import { UNIT_TAG_COLORS } from "@/lib/unitTagColors";
import type { SidebarHospital } from "./buildRows";

interface Props {
  hospitals: SidebarHospital[];
  activeHospital: SidebarHospital;
  activeRoute: string;
  isPlatformAdmin: boolean;
  onSelect: (hospital: SidebarHospital, route: string) => void;
}

type TabValue = "modules" | "links" | "clinics";

export function HospitalDropdownTabs({
  hospitals,
  activeHospital,
  activeRoute,
  isPlatformAdmin,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const distinctHospitalCount = new Set(hospitals.map(h => h.id)).size;
  const isMultiClinic = distinctHospitalCount > 1;

  const hasMedicalAccess =
    activeHospital.unitType === "anesthesia" || activeHospital.unitType === "or";

  // Checklists are global to a hospital (the page is /inventory/checklists
  // regardless of unit, and the count endpoint can sum across all the user's
  // units when no unitId is passed). One row rendered once below the unit
  // cards, with a hospital-wide badge.
  const { data: checklistCount } = useQuery<{ total: number; overdue: number }>({
    queryKey: [`/api/checklists/count/${activeHospital.id}`],
    enabled: !!activeHospital.id,
    refetchInterval: 30000,
  });
  const overdueChecklists = checklistCount?.overdue ?? 0;

  // Cross-tenant management entry-points. Chain when the user holds a
  // group_admin role on any hospital; Platform when the user record itself
  // carries is_platform_admin = true.
  const isChainAdmin = hospitals.some(h => h.role === "group_admin");
  const hasSystemLinks = isChainAdmin || isPlatformAdmin;

  const [tab, setTab] = useState<TabValue>("modules");

  const renderSystemRow = (
    key: "chain" | "platform",
    icon: JSX.Element,
    label: string,
    route: string,
    tagColor: string,
  ) => {
    const isActive = activeRoute === route || activeRoute.startsWith(route + "/");
    return (
      <button
        key={key}
        type="button"
        data-active={isActive ? "true" : undefined}
        data-testid={`system-row-${key}`}
        onClick={() => onSelect(activeHospital, route)}
        className={`relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 ${
          isActive
            ? "bg-primary/20 font-semibold text-primary before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r-sm before:bg-primary"
            : "text-foreground"
        }`}
      >
        <span className={`h-3 w-1 shrink-0 rounded-sm ${tagColor}`} aria-hidden />
        {icon}
        <span className="flex-1 truncate text-left">{label}</span>
      </button>
    );
  };

  return (
    <Tabs value={tab} onValueChange={v => setTab(v as TabValue)} className="w-full">
      <TabsList className={`grid w-full ${isMultiClinic ? "grid-cols-3" : "grid-cols-2"} rounded-none rounded-t-lg`}>
        <TabsTrigger value="modules" data-testid="tab-modules">
          {t("sidebar.tabs.modules", "Modules")}
        </TabsTrigger>
        <TabsTrigger value="links" data-testid="tab-links">
          {t("sidebar.tabs.links", "Links")}
        </TabsTrigger>
        {isMultiClinic && (
          <TabsTrigger value="clinics" data-testid="tab-clinics">
            {t("sidebar.tabs.clinics", "Clinics")}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="modules" className="mt-0 p-1">
        {/* Checklists — global to the hospital (the route + count both span
            all units), pinned to the top of the Modules tab so the red dot
            is visible the moment the dropdown opens. */}
        <button
          type="button"
          data-testid="row-checklists-global"
          data-active={
            activeRoute === "/inventory/checklists" ||
            activeRoute.startsWith("/inventory/checklists/")
              ? "true"
              : undefined
          }
          onClick={() => onSelect(activeHospital, "/inventory/checklists")}
          className={`relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 ${
            activeRoute === "/inventory/checklists"
              ? "bg-primary/20 font-semibold text-primary before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r-sm before:bg-primary"
              : "text-foreground"
          }`}
        >
          <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-left">
            {t("sidebar.shortcut.checklists", "Checklists")}
          </span>
          {overdueChecklists > 0 && (
            <span
              data-testid="checklists-global-badge"
              className="ml-auto rounded-full bg-destructive px-1.5 py-0 text-[10px] font-semibold leading-4 text-destructive-foreground"
            >
              {overdueChecklists}
            </span>
          )}
        </button>
        <div className="my-1 h-px bg-border" />
        <SidebarTree
          hospitals={hospitals}
          activeHospital={activeHospital}
          activeRoute={activeRoute}
          onSelect={onSelect}
          showQuickLinks={false}
        />
        {hasSystemLinks && (
          <>
            <div className="my-1 h-px bg-border" />
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("sidebar.systemSection", "System")}
            </div>
            {isChainAdmin &&
              renderSystemRow(
                "chain",
                <Network className="h-3.5 w-3.5" />,
                t("sidebar.system.chain", "Chain"),
                "/chain",
                UNIT_TAG_COLORS.platform.bg,
              )}
            {isPlatformAdmin &&
              renderSystemRow(
                "platform",
                <Globe className="h-3.5 w-3.5" />,
                t("sidebar.system.platform", "Platform"),
                "/platform",
                UNIT_TAG_COLORS.platform.bg,
              )}
          </>
        )}
      </TabsContent>

      <TabsContent value="links" className="mt-0 p-1">
        <SidebarQuickLinks
          hospital={activeHospital}
          addons={{ questionnaire: !!activeHospital.addonQuestionnaire }}
          hasMedicalAccess={hasMedicalAccess}
        />
      </TabsContent>

      {isMultiClinic && (
        <TabsContent value="clinics" className="mt-0 p-1">
          <SimpleHospitalPicker
            hospitals={hospitals}
            activeHospital={activeHospital}
            onSelect={onSelect}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
