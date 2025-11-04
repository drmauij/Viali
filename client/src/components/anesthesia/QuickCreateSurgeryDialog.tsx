import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickCreateSurgeryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  initialDate: Date;
  initialEndDate?: Date;
  initialRoomId?: string;
  surgeryRooms: any[];
}

export default function QuickCreateSurgeryDialog({
  open,
  onOpenChange,
  hospitalId,
  initialDate,
  initialEndDate,
  initialRoomId,
  surgeryRooms,
}: QuickCreateSurgeryDialogProps) {
  const { toast } = useToast();
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  
  // Helper to format date for datetime-local input (preserves local timezone)
  const formatDateTimeLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Calculate default duration in minutes (3 hours = 180 minutes)
  const getDefaultDuration = () => {
    if (initialEndDate) {
      const diffMs = initialEndDate.getTime() - initialDate.getTime();
      return Math.round(diffMs / (1000 * 60)); // Convert ms to minutes
    }
    return 180; // Default 3 hours
  };

  // Form state
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [surgeryRoomId, setSurgeryRoomId] = useState(initialRoomId || "");
  const [plannedDate, setPlannedDate] = useState(formatDateTimeLocal(initialDate));
  const [duration, setDuration] = useState<number>(getDefaultDuration());
  const [plannedSurgery, setPlannedSurgery] = useState("");
  const [surgeon, setSurgeon] = useState("");
  
  // New patient form state
  const [newPatientFirstName, setNewPatientFirstName] = useState("");
  const [newPatientSurname, setNewPatientSurname] = useState("");
  const [newPatientDOB, setNewPatientDOB] = useState("");
  const [newPatientGender, setNewPatientGender] = useState("m");
  const [newPatientPhone, setNewPatientPhone] = useState("");

  // Fetch patients
  const { data: patients = [] } = useQuery<any[]>({
    queryKey: [`/api/patients?hospitalId=${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  // Fetch surgeons for the hospital
  const {
    data: surgeons = [],
    isLoading: isLoadingSurgeons
  } = useQuery<Array<{id: string; name: string; email: string | null}>>({
    queryKey: [`/api/surgeons?hospitalId=${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  // Create patient mutation
  const createPatientMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/patients", data);
      return response.json();
    },
    onSuccess: (newPatient) => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients?hospitalId=${hospitalId}`] });
      setSelectedPatientId(newPatient.id);
      setShowNewPatientForm(false);
      toast({
        title: "Patient Created",
        description: "New patient has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to create patient. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create surgery mutation
  const createSurgeryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/anesthesia/surgeries", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Surgery Scheduled",
        description: "Surgery has been successfully scheduled.",
      });
      onOpenChange(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Scheduling Failed",
        description: "Failed to schedule surgery. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedPatientId("");
    setSurgeryRoomId(initialRoomId || "");
    setPlannedDate(formatDateTimeLocal(initialDate));
    setDuration(getDefaultDuration());
    setPlannedSurgery("");
    setSurgeon("");
    setShowNewPatientForm(false);
    setNewPatientFirstName("");
    setNewPatientSurname("");
    setNewPatientDOB("");
    setNewPatientGender("m");
    setNewPatientPhone("");
  };

  const handleCreatePatient = () => {
    if (!newPatientFirstName.trim() || !newPatientSurname.trim() || !newPatientDOB) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required patient fields.",
        variant: "destructive",
      });
      return;
    }

    createPatientMutation.mutate({
      hospitalId,
      firstName: newPatientFirstName.trim(),
      surname: newPatientSurname.trim(),
      dateOfBirth: newPatientDOB,
      gender: newPatientGender,
      phone: newPatientPhone.trim() || undefined,
    });
  };

  const handleCreateSurgery = () => {
    if (!selectedPatientId || !surgeryRoomId || !plannedSurgery.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a patient, room, and enter surgery details.",
        variant: "destructive",
      });
      return;
    }

    // Validate duration
    if (!duration || duration <= 0) {
      toast({
        title: "Invalid Duration",
        description: "Duration must be greater than 0 minutes.",
        variant: "destructive",
      });
      return;
    }

    // Calculate end time from start time + duration
    const startDate = new Date(plannedDate);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + duration);

    createSurgeryMutation.mutate({
      hospitalId,
      patientId: selectedPatientId,
      surgeryRoomId,
      plannedDate: startDate.toISOString(),
      actualEndTime: endDate.toISOString(),
      plannedSurgery: plannedSurgery.trim(),
      surgeon: surgeon.trim() || undefined,
      status: "planned",
    });
  };

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-quick-create-surgery">
        <DialogHeader>
          <DialogTitle>Quick Schedule Surgery</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Patient Selection */}
          <div className="space-y-2">
            <Label>Patient *</Label>
            {!showNewPatientForm ? (
              <div className="flex gap-2">
                <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={patientSearchOpen}
                      className="flex-1 justify-between"
                      data-testid="button-select-patient"
                    >
                      {selectedPatient
                        ? `${selectedPatient.surname}, ${selectedPatient.firstName}`
                        : "Select patient..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Search patients..." />
                      <CommandList>
                        <CommandEmpty>No patients found.</CommandEmpty>
                        <CommandGroup>
                          {patients.map((patient) => (
                            <CommandItem
                              key={patient.id}
                              value={`${patient.surname} ${patient.firstName}`}
                              onSelect={() => {
                                setSelectedPatientId(patient.id);
                                setPatientSearchOpen(false);
                              }}
                              data-testid={`patient-option-${patient.id}`}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedPatientId === patient.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {patient.surname}, {patient.firstName} ({new Date(patient.dateOfBirth).toLocaleDateString()})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNewPatientForm(true)}
                  data-testid="button-show-new-patient"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="border rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">New Patient</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewPatientForm(false)}
                    data-testid="button-cancel-new-patient"
                  >
                    Cancel
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-patient-firstname">First Name *</Label>
                    <Input
                      id="new-patient-firstname"
                      value={newPatientFirstName}
                      onChange={(e) => setNewPatientFirstName(e.target.value)}
                      data-testid="input-new-patient-firstname"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-patient-surname">Surname *</Label>
                    <Input
                      id="new-patient-surname"
                      value={newPatientSurname}
                      onChange={(e) => setNewPatientSurname(e.target.value)}
                      data-testid="input-new-patient-surname"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-patient-dob">Date of Birth *</Label>
                    <Input
                      id="new-patient-dob"
                      type="date"
                      value={newPatientDOB}
                      onChange={(e) => setNewPatientDOB(e.target.value)}
                      data-testid="input-new-patient-dob"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-patient-gender">Gender</Label>
                    <Select value={newPatientGender} onValueChange={setNewPatientGender}>
                      <SelectTrigger id="new-patient-gender" data-testid="select-new-patient-gender">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="m">Male</SelectItem>
                        <SelectItem value="f">Female</SelectItem>
                        <SelectItem value="o">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="new-patient-phone">Phone</Label>
                    <Input
                      id="new-patient-phone"
                      type="tel"
                      placeholder="+1 234 567 8900"
                      value={newPatientPhone}
                      onChange={(e) => setNewPatientPhone(e.target.value)}
                      data-testid="input-new-patient-phone"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreatePatient}
                  disabled={createPatientMutation.isPending}
                  className="w-full"
                  data-testid="button-create-patient"
                >
                  {createPatientMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Patient
                </Button>
              </div>
            )}
          </div>

          {/* Surgery Room */}
          <div className="space-y-2">
            <Label htmlFor="surgery-room">Surgery Room *</Label>
            <Select value={surgeryRoomId} onValueChange={setSurgeryRoomId}>
              <SelectTrigger id="surgery-room" data-testid="select-surgery-room">
                <SelectValue placeholder="Select room..." />
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

          {/* Planned Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="planned-date">Start Time *</Label>
              <Input
                id="planned-date"
                type="datetime-local"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                data-testid="input-planned-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes) *</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                data-testid="input-duration"
              />
            </div>
          </div>

          {/* Planned Surgery */}
          <div className="space-y-2">
            <Label htmlFor="planned-surgery">Planned Surgery *</Label>
            <Input
              id="planned-surgery"
              placeholder="e.g., Laparoscopic cholecystectomy"
              value={plannedSurgery}
              onChange={(e) => setPlannedSurgery(e.target.value)}
              data-testid="input-planned-surgery"
            />
          </div>

          {/* Surgeon */}
          <div className="space-y-2">
            <Label htmlFor="surgeon">Surgeon <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Select 
              value={surgeon || "none"} 
              onValueChange={(value) => setSurgeon(value === "none" ? "" : value)}
              disabled={isLoadingSurgeons}
            >
              <SelectTrigger id="surgeon" data-testid="select-surgeon">
                <SelectValue placeholder={isLoadingSurgeons ? "Loading surgeons..." : "Select surgeon (optional)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground italic">No surgeon selected</span>
                </SelectItem>
                {isLoadingSurgeons ? (
                  <SelectItem value="loading" disabled>
                    Loading surgeons...
                  </SelectItem>
                ) : surgeons.length === 0 ? (
                  <SelectItem value="no-surgeons" disabled>
                    No surgeons available
                  </SelectItem>
                ) : (
                  surgeons.map((surgeon) => (
                    <SelectItem key={surgeon.id} value={surgeon.name}>
                      {surgeon.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            data-testid="button-cancel-surgery"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateSurgery}
            disabled={createSurgeryMutation.isPending || !selectedPatientId || !surgeryRoomId || !plannedSurgery.trim()}
            data-testid="button-schedule-surgery"
          >
            {createSurgeryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule Surgery
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
