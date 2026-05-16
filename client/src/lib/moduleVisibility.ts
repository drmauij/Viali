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
  | "worklogs-surgery"
  | "checklists";

export type UnitType =
  | "anesthesia"
  | "or"
  | "clinic"
  | "business"
  | "logistic"
  | null;

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

export interface BadgeCounts {
  overdueChecklists: number;
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
  if (access.unitType === "or" && access.addons.surgery) {
    mods.push("surgery");
  }
  if (access.unitType === "clinic" && access.addons.clinic) {
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

export function getInternalShortcuts(
  access: HospitalAccess,
  badges: BadgeCounts,
): Shortcut[] {
  const items: Shortcut[] = [];

  if (access.addons.worktime) {
    if (access.unitType === "anesthesia") {
      items.push({ id: "worklogs-anesthesia", route: "/anesthesia/worklogs" });
    } else if (access.unitType === "or") {
      items.push({ id: "worklogs-surgery", route: "/surgery/worklogs" });
    }
  }

  // Checklists: belongs to whichever unit currently owns inventory access.
  // Inventory visibility is computed in getVisibleModules; mirror the rule here.
  const ownsInventory =
    access.unitType !== "business" &&
    access.unitType !== "logistic" &&
    access.unitType !== null;
  if (ownsInventory) {
    const item: Shortcut = { id: "checklists", route: "/inventory/checklists" };
    if (badges.overdueChecklists > 0) {
      item.badge = badges.overdueChecklists;
    }
    items.push(item);
  }

  return items;
}
