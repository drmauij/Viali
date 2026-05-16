export type ModuleId =
  | "platform"
  | "anesthesia"
  | "surgery"
  | "clinic"
  | "business"
  | "inventory"
  | "logistic"
  | "administration";

export type ShortcutId =
  | "worklogs-anesthesia"
  | "worklogs-surgery";

export type UnitType =
  | "anesthesia"
  | "or"
  | "clinic"
  | "business"
  | "logistic"
  | (string & {})  // accept unknown unitType strings (future-proofing for praxis etc.)
  | null
  | undefined;

export interface HospitalAddons {
  surgery: boolean;
  clinic: boolean;
  questionnaire: boolean;
  worktime: boolean;
  logistics: boolean;
}

export interface HospitalAccess {
  role: string;
  unitType: UnitType;
  addons: HospitalAddons;
  isGroupAdmin: boolean;
  isPlatformOperator: boolean;
}

export interface Shortcut {
  id: ShortcutId;
  route: string;
  badge?: number;
}

const ADMIN_ROLES = new Set(["admin", "group_admin"]);

export function getVisibleModules(access: HospitalAccess): ModuleId[] {
  const mods: ModuleId[] = [];

  if (access.isPlatformOperator) {
    mods.push("platform");
  }

  if (access.unitType === "anesthesia") {
    mods.push("anesthesia");
  }
  // Surgery/clinic main links follow the role/unit, not the legacy addon
  // gates — having an OR or clinic unit role IS the access signal. The
  // addonSurgery/addonClinic columns are part of the unused billing scaffold
  // and would otherwise hide the main module from users who clearly have
  // access (see CLAUDE memory: "no addon gates by default").
  if (access.unitType === "or") {
    mods.push("surgery");
  }
  if (access.unitType === "clinic") {
    mods.push("clinic");
  }
  if (access.unitType === "business") {
    mods.push("business");
  }
  if (access.unitType === "logistic" && access.addons.logistics) {
    mods.push("logistic");
  }

  // Inventory: visible for any non-business non-logistic unit
  if (
    access.unitType !== "business" &&
    access.unitType !== "logistic" &&
    access.unitType !== null
  ) {
    mods.push("inventory");
  }

  if (ADMIN_ROLES.has(access.role)) {
    mods.push("administration");
  }

  return mods;
}

export function getInternalShortcuts(access: HospitalAccess): Shortcut[] {
  const items: Shortcut[] = [];

  if (access.addons.worktime) {
    if (access.unitType === "anesthesia") {
      items.push({ id: "worklogs-anesthesia", route: "/anesthesia/worklogs" });
    } else if (access.unitType === "or") {
      items.push({ id: "worklogs-surgery", route: "/surgery/worklogs" });
    }
  }

  return items;
}
