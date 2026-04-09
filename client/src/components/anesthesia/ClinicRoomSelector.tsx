import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { DoorOpen, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SurgeryRoom {
  id: string;
  name: string;
  type: "OP" | "PACU" | "CLINIC";
  hospitalId: string;
  sortOrder: number;
}

interface ClinicRoomSelectorProps {
  surgeryId: string;
  hospitalId?: string;
  currentRoomId?: string | null;
  currentRoomName?: string | null;
  onAssign?: (roomId: string | null) => void;
  variant?: "button" | "badge";
  size?: "sm" | "default";
  disabled?: boolean;
}

export function ClinicRoomSelector({
  surgeryId,
  hospitalId: hospitalIdProp,
  currentRoomId,
  currentRoomName,
  onAssign,
  variant = "button",
  size = "default",
  disabled = false,
}: ClinicRoomSelectorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const hospitalId = hospitalIdProp || activeHospital?.id;
  const [open, setOpen] = useState(false);

  const { data: allRooms = [] } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms/${hospitalId}`],
    enabled: !!hospitalId,
  });

  const clinicRooms = useMemo(
    () => allRooms.filter((r) => r.type === "CLINIC"),
    [allRooms],
  );

  const assignMutation = useMutation({
    mutationFn: async (roomId: string | null) => {
      return apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        clinicRoomId: roomId,
      });
    },
    onSuccess: (_, roomId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/${surgeryId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries/today/${hospitalId}`] });
      setOpen(false);
      onAssign?.(roomId);
      toast({
        title: t("common.success"),
        description: roomId
          ? t("anesthesia.clinic.assigned", "Patient marked as waiting")
          : t("anesthesia.clinic.unassigned", "Waiting status cleared"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("anesthesia.clinic.failedToAssign", "Failed to assign clinic room"),
        variant: "destructive",
      });
    },
  });

  const currentRoom = clinicRooms.find((r) => r.id === currentRoomId);
  const displayName = currentRoomName || currentRoom?.name;

  if (variant === "badge" && currentRoomId) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Badge
            variant="secondary"
            className="cursor-pointer gap-1 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
            data-testid="badge-clinic-room"
          >
            <DoorOpen className="h-3 w-3" />
            {displayName}
          </Badge>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <RoomList rooms={clinicRooms} currentRoomId={currentRoomId} onSelect={(id) => assignMutation.mutate(id)} isPending={assignMutation.isPending} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={currentRoomId ? "secondary" : "outline"}
          size={size}
          disabled={disabled}
          className={cn(
            currentRoomId &&
              "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50",
          )}
          data-testid="button-assign-clinic-room"
        >
          <DoorOpen className="h-4 w-4 mr-2" />
          {currentRoomId && displayName ? displayName : t("anesthesia.clinic.markWaiting", "Mark as Waiting")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <RoomList rooms={clinicRooms} currentRoomId={currentRoomId} onSelect={(id) => assignMutation.mutate(id)} isPending={assignMutation.isPending} />
      </PopoverContent>
    </Popover>
  );
}

interface RoomListProps {
  rooms: SurgeryRoom[];
  currentRoomId?: string | null;
  onSelect: (roomId: string | null) => void;
  isPending: boolean;
}

function RoomList({ rooms, currentRoomId, onSelect, isPending }: RoomListProps) {
  const { t } = useTranslation();

  if (rooms.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        {t("anesthesia.clinic.noRooms", "No clinic rooms configured")}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground px-2 py-1">
        {t("anesthesia.clinic.selectRoom", "Select Clinic Room")}
      </div>
      {rooms.map((room) => {
        const isSelected = room.id === currentRoomId;
        return (
          <button
            key={room.id}
            onClick={() => !isPending && onSelect(room.id)}
            disabled={isPending}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
              isSelected
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                : "hover:bg-muted cursor-pointer",
            )}
            data-testid={`button-select-clinic-room-${room.id}`}
          >
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4" />
              <span className="font-medium">{room.name}</span>
            </div>
            {isSelected && <Check className="h-4 w-4 text-amber-700" />}
            {isPending && isSelected && <Loader2 className="h-4 w-4 animate-spin" />}
          </button>
        );
      })}
      {currentRoomId && (
        <>
          <div className="border-t my-1" />
          <button
            onClick={() => !isPending && onSelect(null)}
            disabled={isPending}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10"
            data-testid="button-unassign-clinic-room"
          >
            <X className="h-4 w-4" />
            {t("anesthesia.clinic.clear", "Clear Waiting")}
          </button>
        </>
      )}
    </div>
  );
}
