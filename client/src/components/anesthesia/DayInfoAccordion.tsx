import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Users, FileText } from 'lucide-react';
import PlannedStaffBox, { StaffPoolEntry } from './PlannedStaffBox';
import DayNotesPanel, { useOpDayNotes } from './DayNotesPanel';

interface DayInfoAccordionProps {
  selectedDate: Date;
  hospitalId: string;
}

export default function DayInfoAccordion({ selectedDate, hospitalId }: DayInfoAccordionProps) {
  const { t } = useTranslation();

  const dateString = useMemo(() => {
    const d = new Date(selectedDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  // Read staff pool from cache (same query key as PlannedStaffBox)
  const { data: staffPool = [] } = useQuery<StaffPoolEntry[]>({
    queryKey: ['/api/staff-pool', hospitalId, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/staff-pool/${hospitalId}/${dateString}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch staff pool');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  // Read day notes from cache (same query key as DayNotesPanel)
  const { data: dayNotesData } = useOpDayNotes(hospitalId, selectedDate);
  const hasNotes = !!(dayNotesData?.notes?.trim());

  const availableCount = staffPool.filter(s => !s.isBooked).length;
  const bookedCount = staffPool.filter(s => s.isBooked).length;

  return (
    <div className="mx-4 mt-2">
      <Accordion type="single" defaultValue="staff" collapsible>
        <AccordionItem value="staff" className="border rounded-lg overflow-hidden">
          <AccordionTrigger className="p-2 px-3 bg-muted/50 hover:bg-muted/70 transition-colors hover:no-underline [&[data-state=open]]:rounded-t-lg [&[data-state=closed]]:rounded-lg">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t('staffPool.plannedStaff', 'Planned Staff')}
              </span>
              <Badge variant="secondary" className="text-xs">
                {staffPool.length}
              </Badge>
              {availableCount > 0 && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  {availableCount} {t('staffPool.available', 'available')}
                </span>
              )}
              {bookedCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  | {bookedCount} {t('staffPool.assigned', 'assigned')}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <PlannedStaffBox
              selectedDate={selectedDate}
              hospitalId={hospitalId}
              variant="embedded"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="notes" className="border rounded-lg overflow-hidden mt-1">
          <AccordionTrigger className="p-2 px-3 bg-muted/50 hover:bg-muted/70 transition-colors hover:no-underline [&[data-state=open]]:rounded-t-lg [&[data-state=closed]]:rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {t('dayNotes.title', 'Day Notes')}
              </span>
              {hasNotes && (
                <span className="h-2 w-2 rounded-full bg-amber-500" />
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <DayNotesPanel
              hospitalId={hospitalId}
              selectedDate={selectedDate}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
