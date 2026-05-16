import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SidebarTree } from "./SidebarTree";
import { SidebarQuickLinks } from "./SidebarQuickLinks";
import { SimpleHospitalPicker } from "./SimpleHospitalPicker";
import type { SidebarHospital } from "./buildRows";

interface Props {
  hospitals: SidebarHospital[];
  activeHospital: SidebarHospital;
  activeRoute: string;
  onSelect: (hospital: SidebarHospital, route: string) => void;
}

export function HospitalDropdownTabs({
  hospitals,
  activeHospital,
  activeRoute,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const distinctHospitalCount = new Set(hospitals.map(h => h.id)).size;
  const isMultiClinic = distinctHospitalCount > 1;

  const hasMedicalAccess =
    activeHospital.unitType === "anesthesia" || activeHospital.unitType === "or";

  const [tab, setTab] = useState<"modules" | "links" | "clinics">("modules");

  return (
    <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="w-full">
      <TabsList className={`grid w-full ${isMultiClinic ? "grid-cols-3" : "grid-cols-2"} rounded-none rounded-t-lg`}>
        <TabsTrigger value="modules" data-testid="tab-modules">
          {t("sidebar.tabs.modules", "Modules")}
        </TabsTrigger>
        <TabsTrigger value="links" data-testid="tab-links">
          {t("sidebar.tabs.links", "Links")}
        </TabsTrigger>
        {isMultiClinic && (
          <TabsTrigger value="clinics" data-testid="tab-clinics">
            {t("sidebar.tabs.clinics", "Clinics")}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="modules" className="mt-0 p-1">
        <SidebarTree
          hospitals={hospitals}
          activeHospital={activeHospital}
          activeRoute={activeRoute}
          onSelect={onSelect}
          showQuickLinks={false}
        />
      </TabsContent>

      <TabsContent value="links" className="mt-0 p-1">
        <SidebarQuickLinks
          hospital={activeHospital}
          addons={{ questionnaire: !!activeHospital.addonQuestionnaire }}
          hasMedicalAccess={hasMedicalAccess}
        />
      </TabsContent>

      {isMultiClinic && (
        <TabsContent value="clinics" className="mt-0 p-1">
          <SimpleHospitalPicker
            hospitals={hospitals}
            activeHospital={activeHospital}
            onSelect={onSelect}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
