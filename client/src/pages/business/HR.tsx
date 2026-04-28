import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, FileText, Clock } from "lucide-react";
import SimplifiedStaff from "./SimplifiedStaff";
import Contracts from "./Contracts";
import WorklogManagement from "../WorklogManagement";

const TAB_BY_PATH: Record<string, string> = {
  "/business/contracts": "contracts",
  "/business/worklogs": "worklogs",
  "/business/hr": "staff",
};

export default function HR() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const initial = TAB_BY_PATH[location] ?? "staff";
  const [activeTab, setActiveTab] = useState(initial);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <TabsList className="flex flex-row md:flex-col h-auto w-full md:w-52 shrink-0 justify-start overflow-x-auto md:overflow-x-visible scrollbar-hide bg-muted/50 md:bg-transparent p-1 md:p-0 md:gap-1">
            <TabsTrigger value="staff" className="justify-start md:w-full">
              <Users className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{t('bottomNav.business.staff')}</span>
            </TabsTrigger>
            <TabsTrigger value="contracts" className="justify-start md:w-full">
              <FileText className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{t('bottomNav.business.contracts', 'Contracts')}</span>
            </TabsTrigger>
            <TabsTrigger value="worklogs" className="justify-start md:w-full">
              <Clock className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{t('bottomNav.business.worklogs', 'Worklogs')}</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-w-0">
            <TabsContent value="staff" className="mt-0">
              <SimplifiedStaff />
            </TabsContent>

            <TabsContent value="contracts" className="mt-0">
              <Contracts />
            </TabsContent>

            <TabsContent value="worklogs" className="mt-0">
              <WorklogManagement />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
