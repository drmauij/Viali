import {
  getVisibleModules,
  getInternalShortcuts,
  type HospitalAccess,
  type HospitalAddons,
  type ModuleId,
  type UnitType,
} from "@/lib/moduleVisibility";
import type { ModuleRow } from "./SidebarRoleGroup";

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
  /** Per-role permission for op planning (Requests panel, scheduling). */
  canPlanOps?: boolean;
}

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

// Each unit type has a single "primary" module — the main surface that the
// section header surfaces as a clickable card target. Returning null means
// no primary (unknown unit type / no main module) → the header stays static
// and all rows render in the list as usual.
export function primaryModuleFor(unitType: UnitType): ModuleId | null {
  switch (unitType) {
    case "anesthesia": return "anesthesia";
    case "or":         return "surgery";
    case "clinic":     return "clinic";
    case "business":   return "business";
    case "logistic":   return "logistic";
    default:           return null;
  }
}

export interface BuiltGroup {
  hospital: SidebarHospital;
  /** Primary module row (e.g. "Anesthesia Records" for an anesthesia unit). */
  primary?: ModuleRow;
  /** Secondary rows — everything except `primary`. */
  rows: ModuleRow[];
}

export function buildRows(
  h: SidebarHospital,
  t: ReturnType<typeof import("react-i18next").useTranslation>["t"],
): BuiltGroup {
  const access = accessOf(h);
  const moduleRows: ModuleRow[] = getVisibleModules(access).map(mod => ({
    id: mod,
    label: labelFor(mod, t),
    route: routeFor(h.unitType, mod),
  }));
  const shortcutRows: ModuleRow[] = getInternalShortcuts(access).map(s => ({
    id: s.id,
    label: t(`sidebar.shortcut.${s.id}`, s.id.replace(/-/g, " ")),
    route: s.route,
    badge: s.badge,
  }));
  // Administration is always pinned to the bottom of the secondary list
  // (after inventory and the shortcut rows like Checklists / Worklogs) so its
  // position doesn't shuffle when shortcuts come and go.
  const adminRow = moduleRows.find(r => r.id === "administration");
  const modulesExceptAdmin = moduleRows.filter(r => r.id !== "administration");
  const all = [
    ...modulesExceptAdmin,
    ...shortcutRows,
    ...(adminRow ? [adminRow] : []),
  ];
  const primaryId = primaryModuleFor(h.unitType);
  const primary = primaryId ? all.find(r => r.id === primaryId) : undefined;
  const rows = primary ? all.filter(r => r.id !== primary.id) : all;
  return { hospital: h, primary, rows };
}

// ---------------------------------------------------------------------------
// Hybrid grouping — when the user has only one role on a unit, render as
// today; when they hold multiple roles on the same unit, collapse the role
// groups into one section showing the union of rows and a chip line listing
// the held roles. Avoids the noise of two near-identical sections (e.g.
// "ANESTHESIA · DOCTOR" + "ANESTHESIA · ADMIN" stacked) when admin already
// supersets doctor.
// ---------------------------------------------------------------------------

// Higher-privilege roles win when picking which one to use on click; admin
// is a superset of doctor for routes both roles share, so the user lands in
// the role with the most features available. Unknown roles fall to the end.
const ROLE_PRIORITY: Record<string, number> = {
  group_admin: 0,
  admin: 1,
  manager: 2,
  marketing: 3,
  doctor: 4,
};

export function rolePriority(role: string): number {
  return ROLE_PRIORITY[role] ?? 99;
}

export interface RoleSlice {
  hospital: SidebarHospital;
  primary?: ModuleRow;
  rows: ModuleRow[];
}

export interface SidebarUnitGroup {
  /** Representative hospital row for the unit (highest-priority role). */
  hospital: SidebarHospital;
  /** Role slices for this (hospitalId, unitType), sorted by privilege priority. */
  roles: RoleSlice[];
}

export function groupByUnit(
  hospitals: SidebarHospital[],
  t: ReturnType<typeof import("react-i18next").useTranslation>["t"],
): SidebarUnitGroup[] {
  // Bucket by (hospitalId, unitType) — collapses multiple distinct units of
  // the same type (e.g., three "Anesthesia" units in one hospital created over
  // time) into a single card. Each role slice retains its own hospital row so
  // navigation lands in the specific unit the user clicked.
  const buckets = new Map<string, SidebarHospital[]>();
  for (const h of hospitals) {
    const key = `${h.id}-${h.unitType}`;
    const arr = buckets.get(key) ?? [];
    arr.push(h);
    buckets.set(key, arr);
  }

  const groups: SidebarUnitGroup[] = [];
  for (const roles of buckets.values()) {
    // Sort roles by priority so the highest-priv role is first — both the
    // section representative and the default selection in the chip strip.
    const sortedRoles = [...roles].sort(
      (a, b) => rolePriority(a.role) - rolePriority(b.role),
    );
    const slices: RoleSlice[] = sortedRoles.map(h => {
      const built = buildRows(h, t);
      return { hospital: h, primary: built.primary, rows: built.rows };
    });
    groups.push({ hospital: sortedRoles[0], roles: slices });
  }

  // Strict alphabetical order by unit name. We intentionally do NOT promote
  // the active or default-login group to the top — the active/default state
  // would shuffle the layout under the user's cursor (and the location of a
  // module would change depending on where they're currently signed in),
  // which is more confusing than helpful.
  return groups.sort((a, b) =>
    a.hospital.unitName.localeCompare(b.hospital.unitName),
  );
}
