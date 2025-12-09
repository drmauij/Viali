import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpCircle, TableProperties } from "lucide-react";
import { SurgeryPlanningTable } from "@/components/shared/SurgeryPlanningTable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function HelpTooltip({ content }: { content: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-4 w-4 ml-2 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const mockSurgeryStaffCosts = [
  { id: 1, date: "2024-01-15", patient: "Patient A", surgery: "Hip Replacement", surgeons: 1850, anesthesia: 1280, nurses: 440, assistants: 180, total: 3750 },
  { id: 2, date: "2024-01-15", patient: "Patient B", surgery: "Knee Arthroscopy", surgeons: 920, anesthesia: 640, nurses: 220, assistants: 90, total: 1870 },
  { id: 3, date: "2024-01-14", patient: "Patient C", surgery: "Appendectomy", surgeons: 540, anesthesia: 480, nurses: 165, assistants: 85, total: 1270 },
  { id: 4, date: "2024-01-14", patient: "Patient D", surgery: "Rhinoplasty", surgeons: 1100, anesthesia: 800, nurses: 275, assistants: 110, total: 2285 },
  { id: 5, date: "2024-01-13", patient: "Patient E", surgery: "Carpal Tunnel Release", surgeons: 360, anesthesia: 320, nurses: 110, assistants: 55, total: 845 },
  { id: 6, date: "2024-01-13", patient: "Patient F", surgery: "Spinal Fusion", surgeons: 2200, anesthesia: 1600, nurses: 550, assistants: 220, total: 4570 },
  { id: 7, date: "2024-01-12", patient: "Patient G", surgery: "Hernia Repair", surgeons: 720, anesthesia: 560, nurses: 192, assistants: 90, total: 1562 },
  { id: 8, date: "2024-01-12", patient: "Patient H", surgery: "ACL Reconstruction", surgeons: 1480, anesthesia: 960, nurses: 330, assistants: 150, total: 2920 },
];

export default function SimplifiedDashboard() {
  const { t } = useTranslation();

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold">{t('business.title')}</h1>
        <p className="text-muted-foreground">{t('business.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center">
            <TableProperties className="h-5 w-5 mr-2 text-primary" />
            <CardTitle className="text-lg">{t('business.surgeryPlanning.title')}</CardTitle>
            <HelpTooltip content={t('business.surgeryPlanning.help')} />
          </div>
          <CardDescription>{t('business.surgeryPlanning.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="current">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="current" data-testid="tab-business-current-surgeries">
                {t('surgeryPlanning.currentAndFuture')}
              </TabsTrigger>
              <TabsTrigger value="past" data-testid="tab-business-past-surgeries">
                {t('surgeryPlanning.past')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="current" className="mt-4">
              <SurgeryPlanningTable
                moduleContext="business"
                dateFrom={(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return today;
                })()}
                dateTo={(() => {
                  const future = new Date();
                  future.setFullYear(future.getFullYear() + 1);
                  future.setHours(23, 59, 59, 999);
                  return future;
                })()}
                showFilters={true}
              />
            </TabsContent>
            <TabsContent value="past" className="mt-4">
              <SurgeryPlanningTable
                moduleContext="business"
                dateFrom={(() => {
                  const past = new Date();
                  past.setFullYear(past.getFullYear() - 2);
                  past.setHours(0, 0, 0, 0);
                  return past;
                })()}
                dateTo={(() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  yesterday.setHours(23, 59, 59, 999);
                  return yesterday;
                })()}
                showFilters={true}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center">
            <CardTitle className="text-lg">{t('business.staff.surgeryStaffCosts')}</CardTitle>
            <HelpTooltip content={t('business.help.surgeryStaffCosts')} />
          </div>
          <CardDescription>{t('business.staff.surgeryStaffCostsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('business.staff.date')}</TableHead>
                  <TableHead>{t('business.staff.surgery')}</TableHead>
                  <TableHead className="text-right">{t('business.staff.surgeons')}</TableHead>
                  <TableHead className="text-right">{t('business.staff.anesthesia')}</TableHead>
                  <TableHead className="text-right">{t('business.staff.nurses')}</TableHead>
                  <TableHead className="text-right">{t('business.staff.assistants')}</TableHead>
                  <TableHead className="text-right">{t('business.staff.totalCost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockSurgeryStaffCosts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium">{row.surgery}</TableCell>
                    <TableCell className="text-right">€{row.surgeons.toLocaleString()}</TableCell>
                    <TableCell className="text-right">€{row.anesthesia.toLocaleString()}</TableCell>
                    <TableCell className="text-right">€{row.nurses.toLocaleString()}</TableCell>
                    <TableCell className="text-right">€{row.assistants.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold">€{row.total.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
