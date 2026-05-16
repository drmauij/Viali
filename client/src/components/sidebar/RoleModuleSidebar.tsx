import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronsRight } from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  getVisibleModules,
  getInternalShortcuts,
  type HospitalAccess,
  type HospitalAddons,
  type ModuleId,
  type UnitType,
} from "@/lib/moduleVisibility";
import { SidebarRoleGroup, type ModuleRow } from "./SidebarRoleGroup";
import { SidebarIconRail, type RailGroup, type RailQuickLink } from "./SidebarIconRail";
import { SidebarQuickLinks } from "./SidebarQuickLinks";

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

function addonsOf(h: SidebarHospital): HospitalAddons {
  return {
    surgery: !!h.addonSurgery,
    clinic: !!h.addonClinic,
    questionnaire: !!h.addonQuestionnaire,
    worktime: !!h.addonWorktime,
    logistics: !!h.addonLogistics,
  };
}

function accessOf(h: SidebarHospital): HospitalAccess {
  return {
    role: h.role,
    unitType: h.unitType,
    addons: addonsOf(h),
    isGroupAdmin: h.role === "group_admin",
    isPlatformOperator: !!h.isPlatformOperator,
  };
}

function routeFor(unitType: UnitType, mod: ModuleId): string {
  switch (mod) {
    case "anesthesia": return "/anesthesia/op";
    case "surgery": return "/surgery/op";
    case "clinic": return "/clinic";
    case "business": return "/business";
    case "inventory":
      if (unitType === "anesthesia") return "/anesthesia/inventory";
      if (unitType === "or") return "/surgery/inventory";
      if (unitType === "clinic") return "/clinic/inventory";
      return "/inventory/items";
    case "administration": return "/admin";
    case "logistic": return "/logistic/inventory";
    case "platform": return "/platform";
  }
}

const MODULE_LABELS: Record<ModuleId, string> = {
  anesthesia: "Anesthesia Records",
  surgery: "Surgery",
  clinic: "Clinic",
  business: "Business",
  inventory: "Inventory & Services",
  administration: "Administration",
  logistic: "Logistics",
  platform: "Platform",
};

function labelFor(mod: ModuleId, t: ReturnType<typeof import("react-i18next").useTranslation>["t"]): string {
  return t(`sidebar.module.${mod}`, MODULE_LABELS[mod]);
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

  useEffect(() => {
    localStorage.setItem(STATE_KEY, state);
  }, [state]);

  const ordered = useMemo(
    () => orderGroups(hospitals, activeHospital),
    [hospitals, activeHospital],
  );

  const singleRole = ordered.length === 1;

  const fullGroups = ordered.map(h => {
    const access = accessOf(h);
    const moduleRows: ModuleRow[] = getVisibleModules(access).map(mod => ({
      id: mod,
      label: labelFor(mod, t),
      route: routeFor(h.unitType, mod),
    }));
    const shortcutRows: ModuleRow[] = getInternalShortcuts(access, {
      overdueChecklists,
    }).map(s => ({
      id: s.id,
      label: t(`sidebar.shortcut.${s.id}`, s.id.replace(/-/g, " ")),
      route: s.route,
      badge: s.badge,
    }));
    return { hospital: h, rows: [...moduleRows, ...shortcutRows] };
  });

  const railGroups: RailGroup[] = fullGroups.map(g => ({
    hospital: g.hospital,
    icons: g.rows,
  }));

  const quickLinkIcons: RailQuickLink[] = [];
  if (activeHospital.questionnaireToken && activeHospital.addonQuestionnaire) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    quickLinkIcons.push({
      id: "questionnaire",
      label: t("quickLinks.clinicQuestionnaire"),
      url: activeHospital.questionnaireAlias
        ? `${origin}/q/${activeHospital.questionnaireAlias}`
        : `${origin}/questionnaire/hospital/${activeHospital.questionnaireToken}`,
    });
  }
  if (activeHospital.externalSurgeryToken) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    quickLinkIcons.push({
      id: "externalSurgery",
      label: t("quickLinks.externalSurgery", "OP-Terminreservierung"),
      url: `${origin}/external-surgery/${activeHospital.externalSurgeryToken}`,
    });
  }
  if (activeHospital.bookingToken) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    quickLinkIcons.push({
      id: "booking",
      label: t("quickLinks.bookingPage", "Online-Terminbuchung"),
      url: `${origin}/book/${activeHospital.bookingToken}`,
    });
  }

  return (
    <>
      <span data-testid="sidebar-state" className="sr-only">{state}</span>
    <Sidebar
      collapsible={state === "rail" ? "icon" : state === "hidden" ? "offcanvas" : "none"}
      data-testid="role-module-sidebar"
    >
      {state === "rail" ? (
        <SidebarIconRail
          groups={railGroups}
          quickLinkIcons={quickLinkIcons}
          activeRoute={activeRoute}
          onSelect={(h, icon) => onNavigate(h, icon.route)}
          onExpand={() => setState("full")}
        />
      ) : state === "hidden" ? (
        <button
          type="button"
          aria-label={t("sidebar.showSidebar")}
          onClick={() => setState("full")}
          className="fixed left-0 top-1/2 z-20 flex h-12 w-3 -translate-y-1/2 items-center justify-center rounded-r bg-sidebar text-muted-foreground"
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
      ) : (
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
                  onSelect={(h, row) => onNavigate(h, row.route)}
                  singleRoleMode={singleRole}
                />
              </div>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <SidebarQuickLinks
              hospital={activeHospital}
              addons={{ questionnaire: !!activeHospital.addonQuestionnaire }}
              hasMedicalAccess={
                activeHospital.unitType === "anesthesia" ||
                activeHospital.unitType === "or"
              }
            />
          </SidebarFooter>
        </>
      )}
    </Sidebar>
    </>
  );
}
