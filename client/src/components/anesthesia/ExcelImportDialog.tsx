import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileSpreadsheet, Check, AlertCircle, User, Calendar, Stethoscope, UserCheck, UserX } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";

type Patient = {
  id: string;
  firstName: string;
  surname: string;
  birthday: string;
};

type SurgeryRoom = {
  id: string;
  name: string;
};

type Surgeon = {
  id: string;
  name: string;
  email?: string;
};

type ParsedRow = {
  patientId: string;
  lastName: string;
  firstName: string;
  dob: string;
  surgeryDate: string;
  startTime: string;
  duration: number;
  procedure: string;
  notes: string;
  surgeon: string;
  matchedSurgeon: Surgeon | null;
  existingPatient: Patient | null;
  valid: boolean;
  error?: string;
};

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  surgeryRooms: SurgeryRoom[];
}

export default function ExcelImportDialog({
  open,
  onOpenChange,
  hospitalId,
  surgeryRooms,
}: ExcelImportDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pasteData, setPasteData] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [defaultRoomId, setDefaultRoomId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (surgeryRooms.length > 0) {
      const currentRoomExists = surgeryRooms.some(r => r.id === defaultRoomId);
      if (!defaultRoomId || !currentRoomExists) {
        setDefaultRoomId(surgeryRooms[0].id);
      }
    }
  }, [surgeryRooms, defaultRoomId]);

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: [`/api/patients?hospitalId=${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  const { data: surgeons = [] } = useQuery<Surgeon[]>({
    queryKey: [`/api/surgeons?hospitalId=${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  const matchSurgeon = (surgeonName: string): Surgeon | null => {
    if (!surgeonName.trim()) return null;
    
    const normalized = surgeonName.toLowerCase().trim();
    
    for (const surgeon of surgeons) {
      const surgeonNameLower = surgeon.name.toLowerCase();
      const nameParts = surgeonNameLower.split(/\s+/);
      const lastName = nameParts[nameParts.length - 1];
      const firstName = nameParts[0];
      
      if (surgeonNameLower === normalized) return surgeon;
      if (lastName === normalized) return surgeon;
      if (firstName === normalized) return surgeon;
      if (normalized.includes(lastName) || lastName.includes(normalized)) return surgeon;
    }
    
    return null;
  };

  const parseDateDDMMYYYY = (dateStr: string): string | null => {
    if (!dateStr) return null;
    
    const cleaned = dateStr.trim().replace(/\s+/g, '');
    
    let match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (!match) {
      match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    }
    if (!match) {
      match = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    }
    
    if (!match) return null;
    
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);
    
    if (year < 100) {
      year = year > 50 ? 1900 + year : 2000 + year;
    }
    
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const parseTimeHHMM = (timeStr: string): string | null => {
    if (!timeStr) return null;
    
    const cleaned = timeStr.trim().split(' ')[0];
    
    const match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const parseDuration = (durationStr: string): number => {
    if (!durationStr) return 120;
    
    const cleaned = durationStr.trim().toLowerCase();
    
    const hourMatch = cleaned.match(/(\d+(?:[.,]\d+)?)\s*(std|h|hour|stunde)/i);
    if (hourMatch) {
      const hours = parseFloat(hourMatch[1].replace(',', '.'));
      return Math.round(hours * 60);
    }
    
    const minMatch = cleaned.match(/(\d+)\s*(min|m)/i);
    if (minMatch) {
      return parseInt(minMatch[1], 10);
    }
    
    const numMatch = cleaned.match(/(\d+(?:[.,]\d+)?)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1].replace(',', '.'));
      return num > 10 ? num : Math.round(num * 60);
    }
    
    return 120;
  };

  const findExistingPatient = (firstName: string, lastName: string, dob: string): Patient | null => {
    const normalizedFirst = firstName.toLowerCase().trim();
    const normalizedLast = lastName.toLowerCase().trim();
    
    return patients.find(p => 
      p.firstName.toLowerCase().trim() === normalizedFirst &&
      p.surname.toLowerCase().trim() === normalizedLast &&
      p.birthday === dob
    ) || null;
  };

  const parseExcelData = () => {
    if (!pasteData.trim()) {
      setParsedRows([]);
      return;
    }

    const lines = pasteData.trim().split('\n');
    const parsed: ParsedRow[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      
      const columns = line.split('\t');
      
      if (columns.length < 9) {
        parsed.push({
          patientId: columns[0] || '',
          lastName: columns[1] || '',
          firstName: columns[2] || '',
          dob: '',
          surgeryDate: '',
          startTime: '',
          duration: 120,
          procedure: '',
          notes: '',
          surgeon: '',
          matchedSurgeon: null,
          existingPatient: null,
          valid: false,
          error: t('anesthesia.excelImport.notEnoughColumns', { count: columns.length }),
        });
        continue;
      }

      const patientId = columns[0]?.trim() || '';
      const lastName = columns[1]?.trim() || '';
      const firstName = columns[2]?.trim() || '';
      const dob = parseDateDDMMYYYY(columns[3]) || '';
      const surgeryDate = parseDateDDMMYYYY(columns[4]) || '';
      const startTime = parseTimeHHMM(columns[6]) || parseTimeHHMM(columns[5]) || '';
      const duration = parseDuration(columns[7] || '');
      const procedure = columns[8]?.trim() || '';
      const notes = columns[9]?.trim() || '';
      const surgeon = columns.length > 18 ? (columns[18]?.trim() || '') : '';

      const errors: string[] = [];
      if (!lastName) errors.push(t('anesthesia.excelImport.missingLastName'));
      if (!firstName) errors.push(t('anesthesia.excelImport.missingFirstName'));
      if (!dob) errors.push(t('anesthesia.excelImport.invalidDOB'));
      if (!surgeryDate) errors.push(t('anesthesia.excelImport.invalidSurgeryDate'));
      if (!startTime) errors.push(t('anesthesia.excelImport.invalidStartTime'));
      if (!procedure) errors.push(t('anesthesia.excelImport.missingProcedure'));

      const existingPatient = dob ? findExistingPatient(firstName, lastName, dob) : null;
      const matchedSurgeon = matchSurgeon(surgeon);

      parsed.push({
        patientId,
        lastName,
        firstName,
        dob,
        surgeryDate,
        startTime,
        duration,
        procedure,
        notes,
        surgeon,
        matchedSurgeon,
        existingPatient,
        valid: errors.length === 0,
        error: errors.length > 0 ? errors.join(', ') : undefined,
      });
    }

    setParsedRows(parsed);
    setSelectedRows(new Set(parsed.map((_, i) => i).filter(i => parsed[i].valid)));
  };

  const createPatientMutation = useMutation({
    mutationFn: async (data: { hospitalId: string; firstName: string; surname: string; birthday: string; sex: string }) => {
      const response = await apiRequest("POST", "/api/patients", data);
      return response.json();
    },
  });

  const createSurgeryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/anesthesia/surgeries", data);
      return response.json();
    },
  });

  const handleImport = async () => {
    const rowsToImport = parsedRows.filter((_, i) => selectedRows.has(i) && parsedRows[i].valid);
    
    if (rowsToImport.length === 0) {
      toast({
        title: t('anesthesia.excelImport.noRowsSelected'),
        variant: "destructive",
      });
      return;
    }

    if (!defaultRoomId) {
      toast({
        title: t('anesthesia.excelImport.selectRoom'),
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: rowsToImport.length });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      setImportProgress({ current: i + 1, total: rowsToImport.length });

      try {
        let patientId = row.existingPatient?.id;

        if (!patientId) {
          const newPatient = await createPatientMutation.mutateAsync({
            hospitalId,
            firstName: row.firstName,
            surname: row.lastName,
            birthday: row.dob,
            sex: "O",
          });
          patientId = newPatient.id;
        }

        const plannedDateStr = `${row.surgeryDate}T${row.startTime}:00`;
        
        const [startHour, startMinute] = row.startTime.split(':').map(Number);
        const totalMinutes = startHour * 60 + startMinute + row.duration;
        const endHour = Math.floor(totalMinutes / 60) % 24;
        const endMin = totalMinutes % 60;
        const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`;
        const endDateStr = `${row.surgeryDate}T${endTimeStr}`;

        await createSurgeryMutation.mutateAsync({
          hospitalId,
          patientId,
          surgeryRoomId: defaultRoomId,
          plannedDate: plannedDateStr,
          actualEndTime: endDateStr,
          plannedSurgery: row.procedure,
          surgeon: row.matchedSurgeon?.name || row.surgeon || undefined,
          surgeonId: row.matchedSurgeon?.id || undefined,
          notes: row.notes || undefined,
          status: "planned",
        });

        successCount++;
      } catch (error) {
        console.error("Error importing row:", error);
        errorCount++;
      }
    }

    setIsImporting(false);

    queryClient.invalidateQueries({ queryKey: [`/api/patients?hospitalId=${hospitalId}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });

    toast({
      title: t('anesthesia.excelImport.importComplete'),
      description: t('anesthesia.excelImport.importSummary', { success: successCount, errors: errorCount }),
    });

    if (successCount > 0) {
      onOpenChange(false);
      setPasteData("");
      setParsedRows([]);
      setSelectedRows(new Set());
    }
  };

  const toggleRow = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const toggleAll = () => {
    if (selectedRows.size === parsedRows.filter(r => r.valid).length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(parsedRows.map((_, i) => i).filter(i => parsedRows[i].valid)));
    }
  };

  const formatDisplayDate = (isoDate: string): string => {
    if (!isoDate) return '-';
    const [year, month, day] = isoDate.split('-');
    return `${day}.${month}.${year}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-excel-import">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {t('anesthesia.excelImport.title')}
          </DialogTitle>
          <DialogDescription>
            {t('anesthesia.excelImport.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {parsedRows.length === 0 ? (
            <div className="space-y-3">
              <Label>{t('anesthesia.excelImport.pasteData')}</Label>
              <Textarea
                placeholder={t('anesthesia.excelImport.pastePlaceholder')}
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
                data-testid="textarea-excel-paste"
              />
              <Button onClick={parseExcelData} disabled={!pasteData.trim()} data-testid="button-parse-excel">
                {t('anesthesia.excelImport.parseData')}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Label>{t('anesthesia.excelImport.defaultRoom')}</Label>
                  <Select value={defaultRoomId} onValueChange={setDefaultRoomId}>
                    <SelectTrigger className="w-[200px]" data-testid="select-import-room">
                      <SelectValue placeholder={t('anesthesia.excelImport.selectRoom')} />
                    </SelectTrigger>
                    <SelectContent>
                      {surgeryRooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedRows.size === parsedRows.filter(r => r.valid).length}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-select-all"
                  />
                  <span className="text-sm text-muted-foreground">
                    {t('anesthesia.excelImport.selectedCount', { selected: selectedRows.size, total: parsedRows.filter(r => r.valid).length })}
                  </span>
                </div>
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-2 space-y-2">
                  {parsedRows.map((row, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        row.valid 
                          ? selectedRows.has(index) 
                            ? 'bg-primary/5 border-primary/30' 
                            : 'bg-background border-border'
                          : 'bg-destructive/5 border-destructive/30'
                      }`}
                      data-testid={`import-row-${index}`}
                    >
                      <div className="flex items-start gap-3">
                        {row.valid && (
                          <Checkbox
                            checked={selectedRows.has(index)}
                            onCheckedChange={() => toggleRow(index)}
                            className="mt-1"
                            data-testid={`checkbox-row-${index}`}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {row.lastName}, {row.firstName}
                            </span>
                            {row.existingPatient ? (
                              <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-2 py-0.5 rounded flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {t('anesthesia.excelImport.existingPatient')}
                              </span>
                            ) : row.valid && (
                              <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {t('anesthesia.excelImport.newPatient')}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            <span className="inline-flex items-center gap-1 mr-3">
                              <Calendar className="h-3 w-3" />
                              {formatDisplayDate(row.surgeryDate)} {row.startTime}
                            </span>
                            <span className="mr-3">{row.duration} min</span>
                            <span className="font-medium">{row.procedure}</span>
                          </div>
                          {(row.surgeon || row.matchedSurgeon) && (
                            <div className="text-xs mt-1 flex items-center gap-1">
                              <Stethoscope className="h-3 w-3" />
                              {row.matchedSurgeon ? (
                                <span className="flex items-center gap-1">
                                  <span className="text-green-600 dark:text-green-400">{row.matchedSurgeon.name}</span>
                                  <span className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded text-xs flex items-center gap-0.5">
                                    <UserCheck className="h-3 w-3" />
                                    {t('anesthesia.excelImport.surgeonMatched')}
                                  </span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground">{row.surgeon}</span>
                                  <span className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 px-1.5 py-0.5 rounded text-xs flex items-center gap-0.5">
                                    <UserX className="h-3 w-3" />
                                    {t('anesthesia.excelImport.surgeonUnmatched')}
                                  </span>
                                </span>
                              )}
                            </div>
                          )}
                          {row.error && (
                            <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {row.error}
                            </div>
                          )}
                        </div>
                        {row.valid && (
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Button
                variant="outline"
                onClick={() => {
                  setParsedRows([]);
                  setSelectedRows(new Set());
                }}
                data-testid="button-back-to-paste"
              >
                {t('anesthesia.excelImport.backToPaste')}
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-import">
            {t('common.cancel')}
          </Button>
          {parsedRows.length > 0 && (
            <Button
              onClick={handleImport}
              disabled={isImporting || selectedRows.size === 0 || !defaultRoomId}
              data-testid="button-start-import"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('anesthesia.excelImport.importing', { current: importProgress.current, total: importProgress.total })}
                </>
              ) : (
                t('anesthesia.excelImport.importSelected', { count: selectedRows.size })
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
