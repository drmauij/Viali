import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Bed, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PacuBedSelectorProps {
  surgeryId: string;
  hospitalId?: string;
  currentBedId?: string | null;
  currentBedName?: string | null;
  onAssign?: (bedId: string | null) => void;
  variant?: "button" | "badge" | "inline";
  size?: "sm" | "default";
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

interface SurgeryRoom {
  id: string;
  name: string;
  type: "OP" | "PACU";
  hospitalId: string;
  sortOrder: number;
}

interface Surgery {
  id: string;
  pacuBedId?: string | null;
  patientId: string;
  status: string;
}

export function PacuBedSelector({
  surgeryId,
  hospitalId: hospitalIdProp,
  currentBedId,
  currentBedName,
  onAssign,
  variant = "button",
  size = "default",
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: PacuBedSelectorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const hospitalId = hospitalIdProp || activeHospital?.id;
  
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value);
    } else {
      setInternalOpen(value);
    }
  };

  const { data: allRooms = [] } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms/${hospitalId}`],
    enabled: !!hospitalId,
  });

  const { data: todaySurgeries = [] } = useQuery<Surgery[]>({
    queryKey: [`/api/anesthesia/surgeries/today/${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  const pacuBeds = useMemo(() => {
    return allRooms.filter((room) => room.type === "PACU");
  }, [allRooms]);

  const occupiedBeds = useMemo(() => {
    const occupied = new Map<string, string>();
    todaySurgeries.forEach((surgery) => {
      // Only consider beds occupied by non-cancelled surgeries
      // Beds are freed when pacuBedId is cleared (set to null) during discharge
      if (surgery.pacuBedId && surgery.id !== surgeryId && surgery.status !== 'cancelled') {
        occupied.set(surgery.pacuBedId, surgery.patientId);
      }
    });
    return occupied;
  }, [todaySurgeries, surgeryId]);

  const assignBedMutation = useMutation({
    mutationFn: async (bedId: string | null) => {
      return apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        pacuBedId: bedId,
      });
    },
    onSuccess: (_, bedId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/${surgeryId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/today/${hospitalId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/pacu/${hospitalId}`] });
      setOpen(false);
      onAssign?.(bedId);
      toast({
        title: t("common.success"),
        description: bedId
          ? t("anesthesia.pacu.bedAssigned", "PACU bed assigned")
          : t("anesthesia.pacu.bedUnassigned", "PACU bed unassigned"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("anesthesia.pacu.failedToAssignBed", "Failed to assign PACU bed"),
        variant: "destructive",
      });
    },
  });

  const handleSelectBed = (bedId: string | null) => {
    assignBedMutation.mutate(bedId);
  };

  const currentBed = pacuBeds.find((bed) => bed.id === currentBedId);
  const displayBedName = currentBedName || currentBed?.name;

  // Hidden trigger mode - renders just the popover content, controlled externally
  if (hideTrigger) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <span className="hidden" />
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <BedList
            beds={pacuBeds}
            currentBedId={currentBedId}
            occupiedBeds={occupiedBeds}
            onSelect={handleSelectBed}
            isPending={assignBedMutation.isPending}
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (variant === "badge" && currentBedId) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Badge
            variant="secondary"
            className="cursor-pointer gap-1 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
            data-testid="badge-pacu-bed"
          >
            <Bed className="h-3 w-3" />
            {displayBedName}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <BedList
            beds={pacuBeds}
            currentBedId={currentBedId}
            occupiedBeds={occupiedBeds}
            onSelect={handleSelectBed}
            isPending={assignBedMutation.isPending}
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2">
        {currentBedId && displayBedName ? (
          <Badge
            variant="secondary"
            className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          >
            <Bed className="h-3 w-3" />
            {displayBedName}
          </Badge>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-7 px-2 text-xs"
              data-testid="button-assign-pacu-bed-inline"
            >
              {currentBedId ? (
                <>
                  <Bed className="h-3 w-3 mr-1" />
                  {t("anesthesia.pacu.changeBed", "Change")}
                </>
              ) : (
                <>
                  <Bed className="h-3 w-3 mr-1" />
                  {t("anesthesia.pacu.assignBed", "Assign Bed")}
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <BedList
              beds={pacuBeds}
              currentBedId={currentBedId}
              occupiedBeds={occupiedBeds}
              onSelect={handleSelectBed}
              isPending={assignBedMutation.isPending}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={currentBedId ? "secondary" : "outline"}
          size={size}
          disabled={disabled}
          className={cn(
            currentBedId && "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          )}
          data-testid="button-assign-pacu-bed"
        >
          <Bed className="h-4 w-4 mr-2" />
          {currentBedId && displayBedName
            ? displayBedName
            : t("anesthesia.pacu.assignBed", "Assign PACU Bed")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <BedList
          beds={pacuBeds}
          currentBedId={currentBedId}
          occupiedBeds={occupiedBeds}
          onSelect={handleSelectBed}
          isPending={assignBedMutation.isPending}
        />
      </PopoverContent>
    </Popover>
  );
}

interface BedListProps {
  beds: SurgeryRoom[];
  currentBedId?: string | null;
  occupiedBeds: Map<string, string>;
  onSelect: (bedId: string | null) => void;
  isPending: boolean;
}

interface PacuBedSquareProps {
  surgeryId: string;
  pacuBedName?: string | null;
  pacuBedId?: string | null;
}

export function PacuBedSquare({ surgeryId, pacuBedName, pacuBedId }: PacuBedSquareProps) {
  const { t } = useTranslation();
  const [bedSelectorOpen, setBedSelectorOpen] = useState(false);

  if (pacuBedName) {
    return (
      <>
        <div 
          className="flex-shrink-0 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-center min-w-[100px] self-start cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
          onClick={() => setBedSelectorOpen(true)}
          data-testid="button-pacu-bed-square"
        >
          <Bed className="h-10 w-10 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300" data-testid="text-pacu-bed-name">{pacuBedName}</p>
        </div>
        <PacuBedSelector
          surgeryId={surgeryId}
          currentBedId={pacuBedId || undefined}
          currentBedName={pacuBedName || undefined}
          open={bedSelectorOpen}
          onOpenChange={setBedSelectorOpen}
          hideTrigger
        />
      </>
    );
  }

  return (
    <>
      <div 
        className="flex-shrink-0 p-4 bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center min-w-[100px] self-start cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setBedSelectorOpen(true)}
        data-testid="button-assign-pacu-bed-square"
      >
        <Bed className="h-10 w-10 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('anesthesia.pacu.assignBed', 'Assign Bed')}</p>
      </div>
      <PacuBedSelector
        surgeryId={surgeryId}
        open={bedSelectorOpen}
        onOpenChange={setBedSelectorOpen}
        hideTrigger
      />
    </>
  );
}

function BedList({ beds, currentBedId, occupiedBeds, onSelect, isPending }: BedListProps) {
  const { t } = useTranslation();

  if (beds.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        {t("anesthesia.pacu.noPacuBeds", "No PACU beds configured")}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground px-2 py-1">
        {t("anesthesia.pacu.selectBed", "Select PACU Bed")}
      </div>
      {beds.map((bed) => {
        const isOccupied = occupiedBeds.has(bed.id);
        const isSelected = bed.id === currentBedId;

        return (
          <button
            key={bed.id}
            onClick={() => !isPending && !isOccupied && onSelect(bed.id)}
            disabled={isPending || isOccupied}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
              isSelected
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : isOccupied
                ? "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed"
                : "hover:bg-muted cursor-pointer"
            )}
            data-testid={`button-select-bed-${bed.id}`}
          >
            <div className="flex items-center gap-2">
              <Bed className="h-4 w-4" />
              <span className="font-medium">{bed.name}</span>
            </div>
            <div className="flex items-center gap-1">
              {isOccupied && (
                <span className="text-xs text-gray-500">{t("anesthesia.pacu.occupied", "Occupied")}</span>
              )}
              {isSelected && <Check className="h-4 w-4 text-blue-600" />}
              {isPending && isSelected && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          </button>
        );
      })}
      {currentBedId && (
        <>
          <div className="border-t my-1" />
          <button
            onClick={() => !isPending && onSelect(null)}
            disabled={isPending}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10"
            data-testid="button-unassign-pacu-bed"
          >
            <X className="h-4 w-4" />
            {t("anesthesia.pacu.unassignBed", "Unassign Bed")}
          </button>
        </>
      )}
    </div>
  );
}
