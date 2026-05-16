import { unitTagClass } from "@/lib/unitTagColors";
import { routeFor, labelFor } from "./buildRows";
import { getVisibleModules } from "@/lib/moduleVisibility";
import type { UnitType } from "@/lib/moduleVisibility";
import type { SidebarHospital } from "./RoleModuleSidebar";
import { useTranslation } from "react-i18next";

interface Props {
  hospitals: SidebarHospital[];
  activeHospital: SidebarHospital;
  onSelect: (hospital: SidebarHospital, route: string) => void;
}

/** Groups hospitals by distinct hospital id. */
function groupByHospital(
  hospitals: SidebarHospital[],
): Map<string, SidebarHospital[]> {
  const map = new Map<string, SidebarHospital[]>();
  for (const h of hospitals) {
    const existing = map.get(h.id) ?? [];
    existing.push(h);
    map.set(h.id, existing);
  }
  return map;
}

/** Returns the default navigation route for a given hospital unit-role entry. */
function defaultRouteFor(h: SidebarHospital): string {
  const modules = getVisibleModules({
    role: h.role,
    unitType: h.unitType as UnitType,
    addons: {
      surgery: !!h.addonSurgery,
      clinic: !!h.addonClinic,
      questionnaire: !!h.addonQuestionnaire,
      worktime: !!h.addonWorktime,
      logistics: !!h.addonLogistics,
    },
    isGroupAdmin: h.role === "group_admin",
    isPlatformOperator: !!h.isPlatformOperator,
  });
  const firstMod = modules[0];
  if (!firstMod) return "/";
  return routeFor(h.unitType as UnitType, firstMod);
}

export function SimpleHospitalPicker({ hospitals, activeHospital, onSelect }: Props) {
  const { t } = useTranslation();
  const grouped = groupByHospital(hospitals);

  return (
    <div className="flex flex-col">
      {[...grouped.entries()].map(([hospitalId, entries], sectionIdx) => {
        // All entries in this group share the same hospital name
        const hospitalName = entries[0].name;
        const isActiveSection = entries.some(
          e => e.unitId === activeHospital.unitId && e.role === activeHospital.role,
        );

        return (
          <div key={hospitalId} data-testid={`hospital-section-${hospitalId}`}>
            {sectionIdx > 0 && <div className="my-1 h-px bg-border" />}
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {hospitalName}
            </div>
            {entries.map(h => {
              const isActive =
                h.unitId === activeHospital.unitId && h.role === activeHospital.role;
              const route = defaultRouteFor(h);
              const dotClass = unitTagClass(h.unitType);

              return (
                <button
                  key={`${h.unitId}-${h.role}`}
                  type="button"
                  data-testid={`unit-role-row-${h.unitId}-${h.role}`}
                  onClick={() => onSelect(h, route)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                    isActive ? "bg-accent font-medium text-accent-foreground" : "text-foreground"
                  }`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-sm ${dotClass}`}
                    aria-hidden
                  />
                  <span className="truncate">
                    {h.unitName} · {h.role}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
