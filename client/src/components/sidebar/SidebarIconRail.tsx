import { useTranslation } from "react-i18next";
import { ChevronRight, HeartPulse, Boxes, Shield, Stethoscope, Scissors, BarChart3, Globe, Truck, Clock, ClipboardCheck, FileText, Calendar, CalendarCheck } from "lucide-react";
import { unitTagClass, unitRailBeforeClass, RAIL_BEFORE } from "@/lib/unitTagColors";
import type { UnitType } from "@/lib/moduleVisibility";

interface HospitalRef {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  unitType: UnitType;
  role: string;
}

export interface RailIcon {
  id: string;
  label: string;
  route: string;
  badge?: number;
}

export interface RailGroup {
  hospital: HospitalRef;
  icons: RailIcon[];
}

export interface RailQuickLink {
  id: "questionnaire" | "externalSurgery" | "booking";
  label: string;
  url: string;
}

interface Props {
  groups: RailGroup[];
  quickLinkIcons: RailQuickLink[];
  activeRoute: string;
  onSelect: (h: HospitalRef, icon: RailIcon) => void;
  onExpand: () => void;
}

const MODULE_ICON: Record<string, JSX.Element> = {
  anesthesia: <HeartPulse className="h-4 w-4" />,
  surgery: <Scissors className="h-4 w-4" />,
  clinic: <Stethoscope className="h-4 w-4" />,
  business: <BarChart3 className="h-4 w-4" />,
  inventory: <Boxes className="h-4 w-4" />,
  administration: <Shield className="h-4 w-4" />,
  logistic: <Truck className="h-4 w-4" />,
  platform: <Globe className="h-4 w-4" />,
  "worklogs-anesthesia": <Clock className="h-4 w-4" />,
  "worklogs-surgery": <Clock className="h-4 w-4" />,
  checklists: <ClipboardCheck className="h-4 w-4" />,
};

const QUICK_LINK_ICON: Record<RailQuickLink["id"], JSX.Element> = {
  questionnaire: <FileText className="h-4 w-4" />,
  externalSurgery: <Calendar className="h-4 w-4" />,
  booking: <CalendarCheck className="h-4 w-4" />,
};

export function SidebarIconRail({
  groups,
  quickLinkIcons,
  activeRoute,
  onSelect,
  onExpand,
}: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="flex h-full w-12 flex-col items-center gap-1 overflow-y-auto bg-sidebar py-2 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {groups.map((group, gIdx) => (
        <div key={`${group.hospital.unitId}-${group.hospital.role}`} className="contents">
          {gIdx > 0 && (
            <div
              data-rail-separator
              className="my-1 h-px w-6 bg-border"
              aria-hidden
            />
          )}
          {group.icons.map(icon => {
            const isActive = activeRoute === icon.route || activeRoute.startsWith(icon.route + "/");
            return (
              <button
                key={`${group.hospital.unitId}-${icon.id}`}
                type="button"
                data-active={isActive ? "true" : undefined}
                onClick={() => onSelect(group.hospital, icon)}
                title={`${group.hospital.unitName} · ${group.hospital.role} → ${icon.label}`}
                aria-label={`${group.hospital.unitName} · ${group.hospital.role} → ${icon.label}`}
                className={`relative flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent before:absolute before:-left-[3px] before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-sm ${unitRailBeforeClass(group.hospital.unitType)}`}
              >
                {MODULE_ICON[icon.id] ?? <span className="text-xs">·</span>}
                {icon.badge !== undefined && icon.badge > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1 text-[9px] leading-4 text-destructive-foreground">
                    {icon.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      <div className="mt-auto flex w-full flex-col items-center gap-1">
        {quickLinkIcons.length > 0 && (
          <>
            <div data-rail-separator className="my-1 h-px w-6 bg-border" aria-hidden />
            {quickLinkIcons.map(ql => (
              <a
                key={ql.id}
                href={ql.url}
                target="_blank"
                rel="noopener noreferrer"
                title={ql.label}
                aria-label={ql.label}
                className={`relative flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent before:absolute before:-left-[3px] before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-sm ${RAIL_BEFORE.public}`}
              >
                {QUICK_LINK_ICON[ql.id]}
              </a>
            ))}
          </>
        )}
        <button
          type="button"
          onClick={onExpand}
          aria-label={t("sidebar.expandTooltip")}
          title={t("sidebar.expandTooltip")}
          className="mt-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
