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

type TabValue = "modules" | "links" | "checklists" | "clinics";

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

  // Checklists tab is hidden for units that don't own inventory (business,
  // logistic) — same rule the per-role shortcut used to follow.
  const hasChecklists =
    activeHospital.unitType !== "business" &&
    activeHospital.unitType !== "logistic" &&
    activeHospital.unitType != null;

  // Live count of pending/overdue checklists for the active hospital+unit so
  // the tab trigger can show a red dot without the user having to drill in.
  // Shares the queryKey with BottomNav so the cache is reused across surfaces.
  const { data: checklistCount } = useQuery<{ total: number; overdue: number }>({
    queryKey: [`/api/checklists/count/${activeHospital.id}?unitId=${activeHospital.unitId}`],
    enabled: hasChecklists,
    refetchInterval: 30000,
  });
  const overdueCount = checklistCount?.overdue ?? 0;
  const totalCount = checklistCount?.total ?? 0;

  // Cross-tenant management entry-points. Chain when the user holds a
  // group_admin role on any hospital; Platform when the user record itself
  // carries is_platform_admin = true.
  const isChainAdmin = hospitals.some(h => h.role === "group_admin");
  const hasSystemLinks = isChainAdmin || isPlatformAdmin;

  const [tab, setTab] = useState<TabValue>("modules");

  const tabCount = 2 + (hasChecklists ? 1 : 0) + (isMultiClinic ? 1 : 0);
  const tabsGridClass = ["grid-cols-2", "grid-cols-3", "grid-cols-4"][tabCount - 2];

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
      <TabsList className={`grid w-full ${tabsGridClass} rounded-none rounded-t-lg`}>
        <TabsTrigger value="modules" data-testid="tab-modules">
          {t("sidebar.tabs.modules", "Modules")}
        </TabsTrigger>
        <TabsTrigger value="links" data-testid="tab-links">
          {t("sidebar.tabs.links", "Links")}
        </TabsTrigger>
        {hasChecklists && (
          <TabsTrigger
            value="checklists"
            data-testid="tab-checklists"
            aria-label={t("sidebar.tabs.checklists", "Checklists")}
            className="relative"
          >
            <ClipboardCheck className="h-4 w-4" />
            {overdueCount > 0 && (
              <span
                aria-hidden
                data-testid="tab-checklists-badge"
                className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive"
              />
            )}
          </TabsTrigger>
        )}
        {isMultiClinic && (
          <TabsTrigger value="clinics" data-testid="tab-clinics">
            {t("sidebar.tabs.clinics", "Clinics")}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="modules" className="mt-0 p-1">
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

      {hasChecklists && (
        <TabsContent value="checklists" className="mt-0 p-3">
          <div className="flex flex-col gap-3" data-testid="tab-checklists-content">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-semibold ${overdueCount > 0 ? "text-destructive" : "text-foreground"}`}
                data-testid="checklists-overdue-count"
              >
                {overdueCount}
              </span>
              <span className="text-sm text-muted-foreground">
                {t("sidebar.checklists.overdue", "overdue")}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {t("sidebar.checklists.totalPending", "{{count}} pending", { count: totalCount })}
              </span>
            </div>
            <button
              type="button"
              data-testid="button-open-checklists"
              onClick={() => onSelect(activeHospital, "/inventory/checklists")}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("sidebar.checklists.open", "Open Checklists")}
            </button>
          </div>
        </TabsContent>
      )}

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
