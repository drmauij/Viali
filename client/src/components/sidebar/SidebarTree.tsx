import { useTranslation } from "react-i18next";
import { orderGroups, type SidebarHospital } from "./RoleModuleSidebar";
import { SidebarRoleGroup } from "./SidebarRoleGroup";
import { SidebarQuickLinks } from "./SidebarQuickLinks";
import { buildRows } from "./buildRows";

interface Props {
  hospitals: SidebarHospital[];
  activeHospital: SidebarHospital;
  activeRoute: string;
  overdueChecklists?: number;
  onSelect: (h: SidebarHospital, route: string) => void;
  showQuickLinks?: boolean;
}

export function SidebarTree({
  hospitals,
  activeHospital,
  activeRoute,
  overdueChecklists = 0,
  onSelect,
  showQuickLinks = true,
}: Props) {
  const { t } = useTranslation();
  const ordered = orderGroups(hospitals, activeHospital);

  return (
    <div className="flex flex-col">
      {ordered.map(h => {
        const { rows } = buildRows(h, t, overdueChecklists);
        return (
          <SidebarRoleGroup
            key={`${h.unitId}-${h.role}`}
            hospital={h}
            rows={rows}
            activeRoute={activeRoute}
            onSelect={(host, row) => onSelect(host, row.route)}
          />
        );
      })}
      {showQuickLinks && (
        <SidebarQuickLinks
          hospital={activeHospital}
          addons={{ questionnaire: !!activeHospital.addonQuestionnaire }}
          hasMedicalAccess={
            activeHospital.unitType === "anesthesia" ||
            activeHospital.unitType === "or"
          }
        />
      )}
    </div>
  );
}
