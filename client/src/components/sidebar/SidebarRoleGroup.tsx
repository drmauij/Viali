import { unitTagClass } from "@/lib/unitTagColors";
import type { UnitType } from "@/lib/moduleVisibility";

export interface ModuleRow {
  id: string;
  label: string;
  route: string;
  badge?: number;
}

interface HospitalRef {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  unitType: UnitType;
  role: string;
}

interface Props {
  hospital: HospitalRef;
  rows: ModuleRow[];
  activeRoute: string;
  /** True when this group's unit-role is the user's currently active selection. */
  isActiveGroup: boolean;
  onSelect: (hospital: HospitalRef, row: ModuleRow) => void;
  singleRoleMode?: boolean;
}

export function SidebarRoleGroup({
  hospital,
  rows,
  activeRoute,
  isActiveGroup,
  onSelect,
  singleRoleMode = false,
}: Props) {
  const tagBg = unitTagClass(hospital.unitType);

  return (
    <div className="py-1" data-role-group>
      {!singleRoleMode && (
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {hospital.unitName} · {hospital.role}
        </div>
      )}
      <div className="flex flex-col">
        {rows.map(row => {
          // A row is active only when its unit-role group matches the active
          // selection AND the current URL matches the row's route. Without the
          // group check, the same module route under multiple unit-roles would
          // all light up at once.
          const routeMatches =
            activeRoute === row.route || activeRoute.startsWith(row.route + "/");
          const isActive = isActiveGroup && routeMatches;
          return (
            <button
              key={row.id}
              type="button"
              role="button"
              data-active={isActive ? "true" : undefined}
              onClick={() => onSelect(hospital, row)}
              className={`relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 ${
                isActive
                  ? "bg-accent/60 font-medium text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r-sm before:bg-primary"
                  : "text-foreground"
              }`}
            >
              <span className={`h-3 w-1 shrink-0 rounded-sm ${tagBg}`} aria-hidden />
              <span className="flex-1 truncate text-left">{row.label}</span>
              {row.badge !== undefined && row.badge > 0 && (
                <span className="ml-auto rounded-full bg-destructive px-1.5 py-0 text-[10px] font-semibold leading-4 text-destructive-foreground">
                  {row.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
