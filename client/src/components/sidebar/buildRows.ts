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

// ---------------------------------------------------------------------------
// Quick Links — shared data builder consumed by both SidebarQuickLinks (full)
// and RoleModuleSidebar / SidebarIconRail (rail). Keeps visibility logic in
// one place so full and rail states always agree on which links to show.
// ---------------------------------------------------------------------------

export interface QuickLinkData {
  id: "questionnaire" | "externalSurgery" | "booking";
  label: string;
  url: string;
  /** Present only on the booking row; used to download the QR poster. */
  posterUrl?: string;
}

interface QuickLinkHospital {
  id: string;
  questionnaireToken?: string | null;
  questionnaireAlias?: string | null;
  externalSurgeryToken?: string | null;
  bookingToken?: string | null;
}

export function buildQuickLinks(
  hospital: QuickLinkHospital,
  addons: { questionnaire: boolean },
  hasMedicalAccess: boolean,
  t: ReturnType<typeof import("react-i18next").useTranslation>["t"],
): QuickLinkData[] {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const links: QuickLinkData[] = [];

  if (hospital.questionnaireToken && addons.questionnaire) {
    const url = hospital.questionnaireAlias
      ? `${origin}/q/${hospital.questionnaireAlias}`
      : `${origin}/questionnaire/hospital/${hospital.questionnaireToken}`;
    links.push({ id: "questionnaire", label: t("quickLinks.clinicQuestionnaire"), url });
  }

  if (hospital.externalSurgeryToken && hasMedicalAccess) {
    links.push({
      id: "externalSurgery",
      label: t("quickLinks.externalSurgery", "External Surgery Reservation"),
      url: `${origin}/external-surgery/${hospital.externalSurgeryToken}`,
    });
  }

  if (hospital.bookingToken) {
    links.push({
      id: "booking",
      label: t("quickLinks.bookingPage", "Online-Terminbuchung"),
      url: `${origin}/book/${hospital.bookingToken}`,
      posterUrl: `${origin}/api/booking/poster/${hospital.bookingToken}`,
    });
  }

  return links;
}

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

export function routeFor(_unitType: UnitType, mod: ModuleId): string {
  switch (mod) {
    case "anesthesia": return "/anesthesia/op";
    case "surgery": return "/surgery/op";
    case "clinic": return "/clinic";
    case "business": return "/business";
    case "inventory": return "/inventory/items";
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
