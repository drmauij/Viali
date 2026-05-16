import { ChevronRight } from "lucide-react";
import { unitCardClass, unitTagClass } from "@/lib/unitTagColors";
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
  /**
   * The unit's primary module (e.g. "Anesthesia Records" on an anesthesia
   * unit). When present, the whole card becomes a clickable target for this
   * row — clicking the card surface navigates to the primary module. The
   * row itself is dropped from the secondary list since the card subsumes it.
   */
  primary?: ModuleRow;
  /** Secondary rows shown beneath the header (no primary in here). */
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
  primary,
  rows,
  activeRoute,
  isActiveGroup,
  onSelect,
  singleRoleMode = false,
  chips,
}: Props) {
  const tagBg = unitTagClass(hospital.unitType);
  const cardBg = unitCardClass(hospital.unitType);
  const isMerged = !!chips && chips.length > 1;

  // singleRoleMode hides the header entirely (used when a parent surface
  // already supplies the unit context); just render rows in a plain list.
  if (singleRoleMode) {
    return (
      <div className="flex flex-col py-1" data-role-group>
        {rows.map(row => renderRow(row, hospital, activeRoute, isActiveGroup, onSelect, tagBg))}
      </div>
    );
  }

  const routeMatchesPrimary =
    primary &&
    (activeRoute === primary.route || activeRoute.startsWith(primary.route + "/"));
  const isPrimaryActive = !!routeMatchesPrimary && isActiveGroup;
  // The card ring fires whenever this unit-role is the user's current
  // selection — even when the active route is a secondary module (Inventory,
  // Administration, etc.). The ring tells the user "this unit owns the page
  // you're on" at a glance, while the header text-primary tint is reserved
  // for the case where the primary module itself is active.
  const showCardActive = isActiveGroup;

  const cardClickable = !!primary;
  const handleCardClick = () => {
    if (primary) onSelect(primary.hospital ?? hospital, primary);
  };

  // The wrapper card is given role="button" rather than nested <button>s so
  // chip and row buttons inside stay valid (no nested interactive elements).
  // Each interactive child calls e.stopPropagation() so clicking a chip or
  // row doesn't also fire the card's primary action.
  return (
    <div
      data-role-group
      data-testid="unit-card"
      data-active={showCardActive ? "true" : undefined}
      data-primary-active={isPrimaryActive ? "true" : undefined}
      role={cardClickable ? "button" : undefined}
      tabIndex={cardClickable ? 0 : undefined}
      aria-label={cardClickable ? hospital.unitName : undefined}
      onClick={cardClickable ? handleCardClick : undefined}
      onKeyDown={
        cardClickable
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardClick();
              }
            }
          : undefined
      }
      className={`mx-2 my-1 overflow-hidden rounded-lg border border-border/40 ${cardBg} transition-colors ${
        cardClickable ? "cursor-pointer hover:bg-accent/40" : ""
      } ${showCardActive ? "ring-1 ring-primary" : ""}`}
    >
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <span className={`h-4 w-1 shrink-0 rounded-sm ${tagBg}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-base font-semibold leading-tight ${
              isPrimaryActive ? "text-primary" : "text-foreground"
            }`}
          >
            {hospital.unitName}
          </div>
          {!isMerged && (
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {hospital.role}
            </div>
          )}
        </div>
      </div>

      {isMerged && (
        <div
          data-testid="role-subtitle"
          className="flex flex-wrap gap-1 px-3 pb-1"
        >
          {chips!.map(chip => (
            <button
              key={chip.role}
              type="button"
              data-testid={`role-chip-${chip.role}`}
              data-selected={chip.selected ? "true" : undefined}
              onClick={e => {
                e.stopPropagation();
                chip.onClick();
              }}
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

      {rows.length > 0 && (
        <div className="mt-1 flex flex-col border-t border-border/30 bg-background/30 py-1">
          {rows.map(row => renderRow(row, hospital, activeRoute, isActiveGroup, onSelect, tagBg))}
        </div>
      )}
    </div>
  );
}

function renderRow(
  row: ModuleRow,
  hospital: HospitalRef,
  activeRoute: string,
  isActiveGroup: boolean,
  onSelect: (h: HospitalRef, r: ModuleRow) => void,
  tagBg: string,
) {
  const routeMatches =
    activeRoute === row.route || activeRoute.startsWith(row.route + "/");
  const isActive = isActiveGroup && routeMatches;
  // Secondary rows: smaller text + muted color so they read as sub-modules
  // under the prominent unit card. The `group` + `group-hover:*` utilities
  // give a noticeable hover footprint (background, color, weight, chevron)
  // so it's unambiguous which one the click will hit instead of the card.
  return (
    <button
      key={row.id}
      type="button"
      data-active={isActive ? "true" : undefined}
      onClick={e => {
        e.stopPropagation();
        onSelect(row.hospital ?? hospital, row);
      }}
      className={`group relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        isActive
          ? "bg-primary/20 font-semibold text-primary before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r-sm before:bg-primary"
          : "text-muted-foreground hover:bg-accent hover:font-medium hover:text-foreground"
      }`}
    >
      <span
        className={`h-2.5 w-0.5 shrink-0 rounded-sm ${tagBg} ${
          isActive ? "" : "opacity-50 group-hover:opacity-100"
        }`}
        aria-hidden
      />
      <span className="flex-1 truncate text-left">{row.label}</span>
      {row.badge !== undefined && row.badge > 0 && (
        <span className="ml-auto rounded-full bg-destructive px-1.5 py-0 text-[10px] font-semibold leading-4 text-destructive-foreground">
          {row.badge}
        </span>
      )}
      {!isActive && (
        <ChevronRight
          className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60"
          aria-hidden
        />
      )}
    </button>
  );
}
