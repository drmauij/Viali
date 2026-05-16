import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronsRight } from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import type { UnitType } from "@/lib/moduleVisibility";
import { SidebarRoleGroup } from "./SidebarRoleGroup";
import { SidebarIconRail, type RailGroup, type RailQuickLink } from "./SidebarIconRail";
import { SidebarQuickLinks } from "./SidebarQuickLinks";
import { buildRows, buildQuickLinks } from "./buildRows";

export interface SidebarHospital {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  unitType: UnitType;
  role: string;
  addonSurgery?: boolean;
  addonClinic?: boolean;
  addonQuestionnaire?: boolean;
  addonWorktime?: boolean;
  addonLogistics?: boolean;
  questionnaireToken?: string | null;
  questionnaireAlias?: string | null;
  externalSurgeryToken?: string | null;
  bookingToken?: string | null;
  isDefaultLogin?: boolean;
  isPlatformOperator?: boolean;
}

type SidebarState = "full" | "rail" | "hidden";

interface Props {
  hospitals: SidebarHospital[];
  activeHospital: SidebarHospital;
  activeRoute: string;
  overdueChecklists?: number;
  onNavigate: (h: SidebarHospital, route: string) => void;
  onSwitchHospital: () => void;
}

const STATE_KEY = "sidebarState";

function defaultStateForViewport(): SidebarState {
  if (typeof window === "undefined") return "full";
  if (window.innerWidth < 768) return "hidden";
  if (window.innerWidth < 1280) return "rail";
  return "full";
}

export function orderGroups(
  hospitals: SidebarHospital[],
  active: SidebarHospital,
): SidebarHospital[] {
  return [...hospitals].sort((a, b) => {
    const aActive = a.unitId === active.unitId && a.role === active.role ? 1 : 0;
    const bActive = b.unitId === active.unitId && b.role === active.role ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aDefault = a.isDefaultLogin ? 1 : 0;
    const bDefault = b.isDefaultLogin ? 1 : 0;
    if (aDefault !== bDefault) return bDefault - aDefault;
    return a.unitName.localeCompare(b.unitName);
  });
}


export function RoleModuleSidebar({
  hospitals,
  activeHospital,
  activeRoute,
  overdueChecklists = 0,
  onNavigate,
  onSwitchHospital,
}: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<SidebarState>(() => {
    if (typeof window === "undefined") return "full";
    const saved = localStorage.getItem(STATE_KEY) as SidebarState | null;
    if (saved === "full" || saved === "rail" || saved === "hidden") return saved;
    return defaultStateForViewport();
  });

  // Track the last non-hidden state so reopening from hidden restores it.
  const prevVisibleState = useRef<"full" | "rail">("full");

  useEffect(() => {
    localStorage.setItem(STATE_KEY, state);
    if (state === "full" || state === "rail") {
      prevVisibleState.current = state;
    }
  }, [state]);

  const ordered = useMemo(
    () => orderGroups(hospitals, activeHospital),
    [hospitals, activeHospital],
  );

  const singleRole = ordered.length === 1;

  const fullGroups = ordered.map(h => buildRows(h, t, overdueChecklists));

  const railGroups: RailGroup[] = fullGroups.map(g => ({
    hospital: g.hospital,
    icons: g.rows,
  }));

  const hasMedicalAccess =
    activeHospital.unitType === "anesthesia" || activeHospital.unitType === "or";

  const quickLinkData = buildQuickLinks(
    activeHospital,
    { questionnaire: !!activeHospital.addonQuestionnaire },
    hasMedicalAccess,
    t,
  );

  // Rail only needs id/label/url — posterUrl is full-state only (icon-only rail
  // has no room for a QR button, but the visibility decision comes from the same
  // shared source as the full state).
  const quickLinkIcons: RailQuickLink[] = quickLinkData.map(ql => ({
    id: ql.id,
    label: ql.label,
    url: ql.url,
  }));

  function isMobile(): boolean {
    return typeof window !== "undefined" && window.innerWidth < 768;
  }

  const handleSelect = (h: SidebarHospital, route: string) => {
    onNavigate(h, route);
    if (isMobile()) setState("hidden");
  };

  return (
    <>
      <span data-testid="sidebar-state" className="sr-only">{state}</span>
      {state === "hidden" && (
        <button
          type="button"
          aria-label={t("sidebar.showSidebar")}
          onClick={() => setState(prevVisibleState.current)}
          className="fixed left-0 top-1/2 z-20 flex h-12 w-3 -translate-y-1/2 items-center justify-center rounded-r bg-sidebar text-muted-foreground"
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
      )}
    <Sidebar
      collapsible={state === "rail" ? "icon" : state === "hidden" ? "offcanvas" : "none"}
      data-testid="role-module-sidebar"
    >
      {state === "rail" ? (
        <SidebarIconRail
          groups={railGroups}
          quickLinkIcons={quickLinkIcons}
          activeRoute={activeRoute}
          onSelect={(h, icon) => handleSelect(h, icon.route)}
          onExpand={() => setState("full")}
        />
      ) : state === "hidden" ? null : (
        <>
          <SidebarHeader className="flex flex-row items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={onSwitchHospital}
              className="flex flex-1 items-center gap-2 text-left"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeHospital.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{activeHospital.name}</div>
                <div className="text-[10px] text-muted-foreground">▾ {t("sidebar.switchHospital")}</div>
              </div>
            </button>
            <button
              type="button"
              aria-label={t("sidebar.collapseTooltip")}
              title={t("sidebar.collapseTooltip")}
              onClick={() => setState("rail")}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </SidebarHeader>
          <SidebarContent>
            {fullGroups.map(g => (
              <div
                key={`${g.hospital.unitId}-${g.hospital.role}`}
                data-role-group
              >
                <SidebarRoleGroup
                  hospital={g.hospital}
                  rows={g.rows}
                  activeRoute={activeRoute}
                  onSelect={(h, row) => handleSelect(h, row.route)}
                  singleRoleMode={singleRole}
                />
              </div>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <SidebarQuickLinks
              hospital={activeHospital}
              addons={{ questionnaire: !!activeHospital.addonQuestionnaire }}
              hasMedicalAccess={hasMedicalAccess}
            />
          </SidebarFooter>
        </>
      )}
    </Sidebar>
    </>
  );
}
