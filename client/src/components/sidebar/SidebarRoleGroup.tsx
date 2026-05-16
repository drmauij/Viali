import { useTranslation } from "react-i18next";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
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
  onSelect: (hospital: HospitalRef, row: ModuleRow) => void;
  singleRoleMode?: boolean;
}

export function SidebarRoleGroup({
  hospital,
  rows,
  activeRoute,
  onSelect,
  singleRoleMode = false,
}: Props) {
  const { t } = useTranslation();
  const tagBg = unitTagClass(hospital.unitType);

  return (
    <SidebarGroup>
      {!singleRoleMode && (
        <SidebarGroupLabel>
          {hospital.unitName} · {hospital.role}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {rows.map(row => {
            const isActive = activeRoute === row.route || activeRoute.startsWith(row.route + "/");
            return (
              <SidebarMenuItem key={row.id}>
                <SidebarMenuButton
                  data-active={isActive ? "true" : undefined}
                  onClick={() => onSelect(hospital, row)}
                  className="gap-2"
                >
                  <span
                    className={`h-3 w-1 rounded-sm ${tagBg}`}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-left">{row.label}</span>
                  {row.badge !== undefined && row.badge > 0 && (
                    <span className="ml-auto rounded-full bg-destructive px-1.5 py-0 text-[10px] font-semibold leading-4 text-destructive-foreground">
                      {row.badge}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
