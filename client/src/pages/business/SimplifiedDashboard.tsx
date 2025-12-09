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

const mockSurgeryCostBreakdown = [
  { id: 1, date: "2024-01-15", surgery: "Hip Replacement", staffCost: 2850, anesthesiaMaterials: 1480, surgeryMaterials: 3200, totalCost: 7530, patientPayment: 12500 },
  { id: 2, date: "2024-01-15", surgery: "Knee Arthroscopy", staffCost: 1420, anesthesiaMaterials: 640, surgeryMaterials: 890, totalCost: 2950, patientPayment: 5800 },
  { id: 3, date: "2024-01-14", surgery: "Appendectomy", staffCost: 980, anesthesiaMaterials: 380, surgeryMaterials: 520, totalCost: 1880, patientPayment: 4200 },
  { id: 4, date: "2024-01-14", surgery: "Rhinoplasty", staffCost: 1650, anesthesiaMaterials: 720, surgeryMaterials: 1100, totalCost: 3470, patientPayment: 8500 },
  { id: 5, date: "2024-01-13", surgery: "Carpal Tunnel Release", staffCost: 680, anesthesiaMaterials: 280, surgeryMaterials: 350, totalCost: 1310, patientPayment: 2800 },
  { id: 6, date: "2024-01-13", surgery: "Spinal Fusion", staffCost: 3800, anesthesiaMaterials: 1850, surgeryMaterials: 8500, totalCost: 14150, patientPayment: 28000 },
  { id: 7, date: "2024-01-12", surgery: "Hernia Repair", staffCost: 1120, anesthesiaMaterials: 420, surgeryMaterials: 680, totalCost: 2220, patientPayment: 4800 },
  { id: 8, date: "2024-01-12", surgery: "ACL Reconstruction", staffCost: 2100, anesthesiaMaterials: 890, surgeryMaterials: 2400, totalCost: 5390, patientPayment: 9500 },
];

export default function SimplifiedDashboard() {
  const { t } = useTranslation();

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold">{t('business.dashboard.title')}</h1>
        <p className="text-muted-foreground">{t('business.dashboard.subtitle')}</p>
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
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="current" data-testid="tab-business-current-surgeries">
                {t('surgeryPlanning.currentAndFuture')}
              </TabsTrigger>
              <TabsTrigger value="past" data-testid="tab-business-past-surgeries">
                {t('surgeryPlanning.past')}
              </TabsTrigger>
              <TabsTrigger value="costs" data-testid="tab-business-costs">
                {t('business.tabs.costs', 'Costs')}
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
            <TabsContent value="costs" className="mt-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center">
                    {t('business.costBreakdown.title', 'Surgery Cost Breakdown')}
                    <HelpTooltip content={t('business.costBreakdown.help', 'Cost breakdown per surgery showing staff costs, materials, and patient payment')} />
                  </h3>
                  <p className="text-sm text-muted-foreground">{t('business.costBreakdown.description', 'Detailed cost analysis for each surgery')}</p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('business.staff.date', 'Date')}</TableHead>
                        <TableHead>{t('business.staff.surgery', 'Surgery')}</TableHead>
                        <TableHead className="text-right">{t('business.costBreakdown.staffCost', 'Staff')}</TableHead>
                        <TableHead className="text-right">{t('business.costBreakdown.anesthesiaMaterials', 'Anesthesia Meds & Materials')}</TableHead>
                        <TableHead className="text-right">{t('business.costBreakdown.surgeryMaterials', 'Surgery Materials')}</TableHead>
                        <TableHead className="text-right">{t('business.costBreakdown.totalCost', 'Total Cost')}</TableHead>
                        <TableHead className="text-right">{t('business.costBreakdown.patientPayment', 'Patient Payment')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mockSurgeryCostBreakdown.map((row) => (
                        <TableRow key={row.id} data-testid={`row-cost-breakdown-${row.id}`}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell className="font-medium">{row.surgery}</TableCell>
                          <TableCell className="text-right">€{row.staffCost.toLocaleString()}</TableCell>
                          <TableCell className="text-right">€{row.anesthesiaMaterials.toLocaleString()}</TableCell>
                          <TableCell className="text-right">€{row.surgeryMaterials.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold">€{row.totalCost.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-bold text-green-600 dark:text-green-400">€{row.patientPayment.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Old Surgery Cost Breakdown Card - Hidden */}
      {false && (
      <Card>
        <CardHeader>
          <div className="flex items-center">
            <CardTitle className="text-lg">{t('business.costBreakdown.title', 'Surgery Cost Breakdown')}</CardTitle>
            <HelpTooltip content={t('business.costBreakdown.help', 'Cost breakdown per surgery showing staff costs, materials, and patient payment')} />
          </div>
          <CardDescription>{t('business.costBreakdown.description', 'Detailed cost analysis for each surgery')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('business.staff.date', 'Date')}</TableHead>
                  <TableHead>{t('business.staff.surgery', 'Surgery')}</TableHead>
                  <TableHead className="text-right">{t('business.costBreakdown.staffCost', 'Staff')}</TableHead>
                  <TableHead className="text-right">{t('business.costBreakdown.anesthesiaMaterials', 'Anesthesia Meds & Materials')}</TableHead>
                  <TableHead className="text-right">{t('business.costBreakdown.surgeryMaterials', 'Surgery Materials')}</TableHead>
                  <TableHead className="text-right">{t('business.costBreakdown.totalCost', 'Total Cost')}</TableHead>
                  <TableHead className="text-right">{t('business.costBreakdown.patientPayment', 'Patient Payment')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockSurgeryCostBreakdown.map((row) => (
                  <TableRow key={row.id} data-testid={`row-cost-breakdown-${row.id}`}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium">{row.surgery}</TableCell>
                    <TableCell className="text-right">€{row.staffCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">€{row.anesthesiaMaterials.toLocaleString()}</TableCell>
                    <TableCell className="text-right">€{row.surgeryMaterials.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">€{row.totalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-green-600 dark:text-green-400">€{row.patientPayment.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
