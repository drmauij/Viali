import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, FileText, Clock } from "lucide-react";
import SimplifiedStaff from "./SimplifiedStaff";
import Contracts from "./Contracts";
import WorklogManagement from "../WorklogManagement";

export default function HR() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("staff");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{t('business.hr.title', 'HR')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('business.hr.subtitle', 'Staff, contracts and worklogs')}
        </p>
      </div>

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
