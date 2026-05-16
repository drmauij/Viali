import {
  getVisibleModules,
  getInternalShortcuts,
  type HospitalAccess,
  type HospitalAddons,
  type ModuleId,
  type UnitType,
} from "@/lib/moduleVisibility";
import type { ModuleRow } from "./SidebarRoleGroup";
import type { SidebarHospital } from "./RoleModuleSidebar";

export function addonsOf(h: SidebarHospital): HospitalAddons {
  return {
    surgery: !!h.addonSurgery,
    clinic: !!h.addonClinic,
    questionnaire: !!h.addonQuestionnaire,
    worktime: !!h.addonWorktime,
    logistics: !!h.addonLogistics,
  };
}

export function accessOf(h: SidebarHospital): HospitalAccess {
  return {
    role: h.role,
    unitType: h.unitType,
    addons: addonsOf(h),
    isGroupAdmin: h.role === "group_admin",
    isPlatformOperator: !!h.isPlatformOperator,
  };
}

export function routeFor(unitType: UnitType, mod: ModuleId): string {
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

export function labelFor(
  mod: ModuleId,
  t: ReturnType<typeof import("react-i18next").useTranslation>["t"],
): string {
  return t(`sidebar.module.${mod}`, MODULE_LABELS[mod]);
}

export interface BuiltGroup {
  hospital: SidebarHospital;
  rows: ModuleRow[];
}

export function buildRows(
  h: SidebarHospital,
  t: ReturnType<typeof import("react-i18next").useTranslation>["t"],
  overdueChecklists: number,
): BuiltGroup {
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
}
