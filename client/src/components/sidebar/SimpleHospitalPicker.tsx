import { routeFor, rolePriority, type SidebarHospital } from "./buildRows";
import { getVisibleModules } from "@/lib/moduleVisibility";
import type { UnitType } from "@/lib/moduleVisibility";

interface Props {
  hospitals: SidebarHospital[];
  activeHospital: SidebarHospital;
  onSelect: (hospital: SidebarHospital, route: string) => void;
}

/** Picks the highest-privilege entry for a given hospital and returns its default route. */
function pickRepresentative(entries: SidebarHospital[]): SidebarHospital {
  return [...entries].sort((a, b) => rolePriority(a.role) - rolePriority(b.role))[0];
}

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

function groupByHospital(hospitals: SidebarHospital[]): Map<string, SidebarHospital[]> {
  const map = new Map<string, SidebarHospital[]>();
  for (const h of hospitals) {
    const existing = map.get(h.id) ?? [];
    existing.push(h);
    map.set(h.id, existing);
  }
  return map;
}

/**
 * Clinics tab — one row per distinct hospital, no per-unit-role detail.
 * Clicking lands the user in their highest-privilege unit for that hospital.
 * The Modules tab is still the place to switch role/unit explicitly.
 */
export function SimpleHospitalPicker({ hospitals, activeHospital, onSelect }: Props) {
  const grouped = groupByHospital(hospitals);

  return (
    <div className="flex flex-col">
      {[...grouped.entries()].map(([hospitalId, entries]) => {
        const hospitalName = entries[0].name;
        const rep = pickRepresentative(entries);
        const isActive = activeHospital.id === hospitalId;
        const route = defaultRouteFor(rep);

        return (
          <div key={hospitalId} data-testid={`hospital-section-${hospitalId}`}>
            <button
              type="button"
              data-testid={`hospital-row-${hospitalId}`}
              onClick={() => onSelect(rep, route)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                isActive ? "bg-accent font-medium text-accent-foreground" : "text-foreground"
              }`}
            >
              <span className="truncate">{hospitalName}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
