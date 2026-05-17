import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import { groupByUnit, type SidebarHospital } from "../buildRows";

const baseHospital: Omit<SidebarHospital, "unitId" | "unitName" | "unitType" | "role"> = {
  id: "hosp-1",
  name: "Test Hospital",
  addonSurgery: true,
  addonClinic: true,
  addonQuestionnaire: false,
  addonWorktime: false,
  addonLogistics: false,
  questionnaireToken: null,
  questionnaireAlias: null,
  externalSurgeryToken: null,
  bookingToken: null,
  isDefaultLogin: false,
  isPlatformOperator: false,
};

const t = ((k: string, fallback?: string) => fallback ?? k) as unknown as TFunction;

describe("groupByUnit dedup", () => {
  it("collapses multiple units of the same unitType in one hospital into a single card", () => {
    const hospitals: SidebarHospital[] = [
      { ...baseHospital, unitId: "anes-1", unitName: "Anesthesia A", unitType: "anesthesia", role: "admin" },
      { ...baseHospital, unitId: "anes-1", unitName: "Anesthesia A", unitType: "anesthesia", role: "doctor" },
      { ...baseHospital, unitId: "anes-2", unitName: "Anesthesia B", unitType: "anesthesia", role: "admin" },
      { ...baseHospital, unitId: "anes-3", unitName: "Anesthesia C", unitType: "anesthesia", role: "guest" },
    ];
    const groups = groupByUnit(hospitals, t);
    const anesGroups = groups.filter(g => g.hospital.unitType === "anesthesia");
    expect(anesGroups).toHaveLength(1);
    // All 4 role rows flow into the merged group.
    expect(anesGroups[0].roles).toHaveLength(4);
    // Representative is the highest-privilege role's hospital row.
    expect(anesGroups[0].hospital.role).toBe("admin");
  });

  it("keeps different unitTypes in the same hospital as separate groups", () => {
    const hospitals: SidebarHospital[] = [
      { ...baseHospital, unitId: "anes", unitName: "Anesthesia", unitType: "anesthesia", role: "admin" },
      { ...baseHospital, unitId: "or", unitName: "OR", unitType: "or", role: "admin" },
      { ...baseHospital, unitId: "clinic", unitName: "Clinic", unitType: "clinic", role: "admin" },
    ];
    const groups = groupByUnit(hospitals, t);
    expect(groups).toHaveLength(3);
    expect(new Set(groups.map(g => g.hospital.unitType))).toEqual(new Set(["anesthesia", "or", "clinic"]));
  });

  it("keeps the same unitType in different hospitals as separate groups", () => {
    const hospitals: SidebarHospital[] = [
      { ...baseHospital, id: "h1", unitId: "h1-anes", unitName: "Anesthesia", unitType: "anesthesia", role: "admin" },
      { ...baseHospital, id: "h2", unitId: "h2-anes", unitName: "Anesthesia", unitType: "anesthesia", role: "admin" },
    ];
    const groups = groupByUnit(hospitals, t);
    expect(groups).toHaveLength(2);
  });

  it("each RoleSlice keeps its own hospital so clicking the slice navigates to its specific unit", () => {
    const hospitals: SidebarHospital[] = [
      { ...baseHospital, unitId: "anes-A", unitName: "Anesthesia A", unitType: "anesthesia", role: "admin" },
      { ...baseHospital, unitId: "anes-B", unitName: "Anesthesia B", unitType: "anesthesia", role: "doctor" },
    ];
    const [group] = groupByUnit(hospitals, t);
    expect(group.roles).toHaveLength(2);
    const unitIds = group.roles.map(s => s.hospital.unitId).sort();
    expect(unitIds).toEqual(["anes-A", "anes-B"]);
  });
});
