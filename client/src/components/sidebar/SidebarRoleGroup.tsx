import { unitTagClass } from "@/lib/unitTagColors";
import type { UnitType } from "@/lib/moduleVisibility";

export interface ModuleRow {
  id: string;
  label: string;
  route: string;
  badge?: number;
  /**
   * Optional per-row hospital override used by the merged-group mode. When a
   * single section represents multiple roles for one unit, each row is
   * pinned to the role we want to land in when clicked (typically the
   * highest-priv role). Falls back to the section's hospital prop.
   */
  hospital?: HospitalRef;
}

interface HospitalRef {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  unitType: UnitType;
  role: string;
}

export interface RoleChip {
  role: string;
  selected: boolean;
  onClick: () => void;
}

interface Props {
  hospital: HospitalRef;
  rows: ModuleRow[];
  activeRoute: string;
  /** True when this group's unit-role is the user's currently active selection. */
  isActiveGroup: boolean;
  onSelect: (hospital: HospitalRef, row: ModuleRow) => void;
  singleRoleMode?: boolean;
  /**
   * When the section represents multiple roles for one unit, the header drops
   * the inline `· role` suffix and renders these clickable chips as a subtitle.
   * The selected chip is the active role; clicking another chip switches role
   * context. Single-role sections leave this undefined.
   */
  chips?: RoleChip[];
}

export function SidebarRoleGroup({
  hospital,
  rows,
  activeRoute,
  isActiveGroup,
  onSelect,
  singleRoleMode = false,
  chips,
}: Props) {
  const tagBg = unitTagClass(hospital.unitType);
  const isMerged = !!chips && chips.length > 1;

  return (
    <div className="py-1" data-role-group>
      {!singleRoleMode && (
        <div className="px-3 pt-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {isMerged ? hospital.unitName : `${hospital.unitName} · ${hospital.role}`}
          </div>
          {isMerged && (
            <div
              data-testid="role-subtitle"
              className="mt-1 flex flex-wrap gap-1"
            >
              {chips!.map(chip => (
                <button
                  key={chip.role}
                  type="button"
                  data-testid={`role-chip-${chip.role}`}
                  data-selected={chip.selected ? "true" : undefined}
                  onClick={chip.onClick}
                  className={`rounded-full px-2 py-0.5 text-[10px] lowercase tracking-wide transition-colors ${
                    chip.selected
                      ? "bg-primary/20 font-semibold text-primary"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {chip.role}
                </button>
              ))}
            </div>
          )}
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
              onClick={() => onSelect(row.hospital ?? hospital, row)}
              className={`relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 ${
                isActive
                  ? "bg-primary/20 font-semibold text-primary before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r-sm before:bg-primary"
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
