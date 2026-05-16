import { useTranslation } from "react-i18next";
import { SidebarRoleGroup } from "./SidebarRoleGroup";
import { SidebarQuickLinks } from "./SidebarQuickLinks";
import { groupByUnit, type SidebarHospital } from "./buildRows";

interface Props {
  hospitals: SidebarHospital[];
  activeHospital: SidebarHospital;
  activeRoute: string;
  onSelect: (h: SidebarHospital, route: string) => void;
  showQuickLinks?: boolean;
}

export function SidebarTree({
  hospitals,
  activeHospital,
  activeRoute,
  onSelect,
  showQuickLinks = true,
}: Props) {
  const { t } = useTranslation();
  const groups = groupByUnit(hospitals, t);

  return (
    <div className="flex flex-col">
      {groups.map(group => {
        // The "selected role" for a merged section is the active role if it
        // lives in this group, otherwise the highest-priv role (first slice).
        // Drives which slice's rows are listed and which chip is highlighted.
        const selectedSlice =
          group.roles.find(
            r =>
              r.hospital.unitId === activeHospital.unitId &&
              r.hospital.role === activeHospital.role,
          ) ?? group.roles[0];
        const isActiveGroup = group.roles.some(
          r =>
            r.hospital.unitId === activeHospital.unitId &&
            r.hospital.role === activeHospital.role,
        );

        const chips =
          group.roles.length > 1
            ? group.roles.map(slice => ({
                role: slice.hospital.role,
                selected: slice === selectedSlice,
                // Switch into this role. Stay on the current route if the
                // role can still reach it; otherwise jump to that role's
                // primary (or first secondary row as a last resort) so we
                // don't dump the user on a page they no longer have access to.
                onClick: () => {
                  if (slice === selectedSlice) return;
                  const allRoutes = [
                    ...(slice.primary ? [slice.primary] : []),
                    ...slice.rows,
                  ];
                  const sameRoute = allRoutes.find(
                    row =>
                      activeRoute === row.route ||
                      activeRoute.startsWith(row.route + "/"),
                  );
                  const target = sameRoute?.route ?? slice.primary?.route ?? slice.rows[0]?.route;
                  if (target) onSelect(slice.hospital, target);
                },
              }))
            : undefined;

        return (
          <SidebarRoleGroup
            key={`${group.hospital.id}-${group.hospital.unitId}`}
            hospital={selectedSlice.hospital}
            primary={selectedSlice.primary}
            rows={selectedSlice.rows}
            chips={chips}
            activeRoute={activeRoute}
            isActiveGroup={isActiveGroup}
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
