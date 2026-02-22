import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { calculateWorkHours } from "@/lib/worktimeUtils";
import { format } from "date-fns";
import { Search, Clock, ArrowLeft, Check, AlertCircle, Delete } from "lucide-react";

type KioskState = "loading" | "error" | "staff_grid" | "pin_entry" | "time_form" | "success";

interface StaffMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  hasPinSet: boolean;
}

const INACTIVITY_TIMEOUT_MS = 60_000; // 60 seconds

export default function PublicWorktimeKiosk() {
  const { token } = useParams<{ token: string }>();

  const [state, setState] = useState<KioskState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [search, setSearch] = useState("");

  // PIN entry
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinVerifying, setPinVerifying] = useState(false);

  // Time form
  const today = format(new Date(), "yyyy-MM-dd");
  const [formData, setFormData] = useState({
    workDate: today,
    timeStart: "08:00",
    timeEnd: "17:00",
    pauseMinutes: 30,
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Inactivity timer
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetToGrid = useCallback(() => {
    setState("staff_grid");
    setSelectedStaff(null);
    setPin("");
    setPinError(false);
    setSearch("");
    setFormData({
      workDate: format(new Date(), "yyyy-MM-dd"),
      timeStart: "08:00",
      timeEnd: "17:00",
      pauseMinutes: 30,
      notes: "",
    });
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      resetToGrid();
    }, INACTIVITY_TIMEOUT_MS);
  }, [resetToGrid]);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  // Manage inactivity timer based on state
  useEffect(() => {
    if (state === "pin_entry" || state === "time_form") {
      resetInactivityTimer();
    } else {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    }
  }, [state, resetInactivityTimer]);

  // Fetch kiosk data
  const fetchKioskData = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/kiosk/${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.message || "This kiosk link is no longer active");
        setState("error");
        return;
      }
      const data = await res.json();
      setHospitalName(data.hospitalName);
      setStaffList(data.staff);
      setState("staff_grid");
    } catch {
      setErrorMessage("Could not connect to server");
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    fetchKioskData();
  }, [fetchKioskData]);

  // PIN verification
  const verifyPin = useCallback(async (fullPin: string) => {
    if (!selectedStaff) return;
    setPinVerifying(true);
    setPinError(false);
    try {
      const res = await fetch(`/api/public/kiosk/${token}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedStaff.id, pin: fullPin }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setErrorMessage("This kiosk link is no longer active");
          setState("error");
          return;
        }
        if (res.status === 429) {
          setPinError(true);
          setPin("");
          return;
        }
      }
      const data = await res.json();
      if (data.valid) {
        setState("time_form");
        resetInactivityTimer();
      } else {
        setPinError(true);
        setPin("");
      }
    } catch {
      setPinError(true);
      setPin("");
    } finally {
      setPinVerifying(false);
    }
  }, [selectedStaff, token, resetInactivityTimer]);

  // Auto-submit on 4th digit
  useEffect(() => {
    if (pin.length === 4) {
      verifyPin(pin);
    }
  }, [pin, verifyPin]);

  // Submit time entry
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff || !pin) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/public/kiosk/${token}/log-time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedStaff.id,
          pin,
          ...formData,
          pauseMinutes: Number(formData.pauseMinutes),
        }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          setErrorMessage("This kiosk link is no longer active");
          setState("error");
          return;
        }
        if (res.status === 403) {
          // PIN no longer valid (e.g. admin reset it)
          resetToGrid();
          return;
        }
        return;
      }

      setState("success");
      // Auto-return to grid after 3 seconds
      setTimeout(() => {
        resetToGrid();
        // Refresh staff list in case anything changed
        fetchKioskData();
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStaffClick = (staff: StaffMember) => {
    if (!staff.hasPinSet) return;
    setSelectedStaff(staff);
    setPin("");
    setPinError(false);
    setState("pin_entry");
  };

  const handlePinDigit = (digit: string) => {
    resetInactivityTimer();
    if (pin.length < 4) {
      setPin(prev => prev + digit);
      setPinError(false);
    }
  };

  const handlePinBackspace = () => {
    resetInactivityTimer();
    setPin(prev => prev.slice(0, -1));
    setPinError(false);
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "?";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  const filteredStaff = staffList.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.firstName || "").toLowerCase().includes(q) ||
      (s.lastName || "").toLowerCase().includes(q)
    );
  });

  const netHours = calculateWorkHours(formData.timeStart, formData.timeEnd, Number(formData.pauseMinutes) || 0);

  // Loading state
  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Kiosk unavailable</h1>
          <p className="text-muted-foreground text-lg">{errorMessage}</p>
          <Button variant="outline" onClick={() => { setState("loading"); fetchKioskData(); }}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <Check className="h-10 w-10 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Entry saved!</h1>
          <p className="text-muted-foreground text-lg">
            {selectedStaff?.firstName} {selectedStaff?.lastName} — {formData.workDate}
          </p>
          <p className="text-muted-foreground">Returning to staff list...</p>
        </div>
      </div>
    );
  }

  // PIN entry state
  if (state === "pin_entry") {
    return (
      <div className="min-h-screen flex flex-col bg-background" onClick={resetInactivityTimer}>
        {/* Header */}
        <div className="border-b bg-card px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={resetToGrid}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{selectedStaff?.firstName} {selectedStaff?.lastName}</h1>
            <p className="text-sm text-muted-foreground">{hospitalName}</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
          <p className="text-xl text-muted-foreground">Enter your 4-digit PIN</p>

          {/* PIN dots */}
          <div className="flex gap-4">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-5 h-5 rounded-full transition-all duration-150 ${
                  i < pin.length
                    ? pinError ? "bg-destructive scale-110" : "bg-primary scale-110"
                    : "bg-muted-foreground/20"
                } ${pinError && i < pin.length ? "animate-[shake_0.3s_ease-in-out]" : ""}`}
              />
            ))}
          </div>

          {pinError && (
            <p className="text-destructive text-sm font-medium">Wrong PIN — try again</p>
          )}

          {/* Number pad */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((key) => {
              if (key === "") return <div key="empty" />;
              if (key === "back") {
                return (
                  <Button
                    key="back"
                    variant="outline"
                    className="h-16 text-xl"
                    onClick={handlePinBackspace}
                    disabled={pinVerifying || pin.length === 0}
                  >
                    <Delete className="h-6 w-6" />
                  </Button>
                );
              }
              return (
                <Button
                  key={key}
                  variant="outline"
                  className="h-16 text-2xl font-medium"
                  onClick={() => handlePinDigit(key)}
                  disabled={pinVerifying || pin.length >= 4}
                >
                  {key}
                </Button>
              );
            })}
          </div>

          {pinVerifying && (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          )}
        </div>
      </div>
    );
  }

  // Time form state
  if (state === "time_form") {
    return (
      <div className="min-h-screen flex flex-col bg-background" onClick={resetInactivityTimer}>
        {/* Header */}
        <div className="border-b bg-card px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={resetToGrid}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{selectedStaff?.firstName} {selectedStaff?.lastName}</h1>
            <p className="text-sm text-muted-foreground">{hospitalName}</p>
          </div>
        </div>

        <div className="flex-1 flex items-start justify-center p-6">
          <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
            <div>
              <Label className="text-sm font-medium">Date</Label>
              <DateInput
                value={formData.workDate}
                onChange={(v) => { setFormData({ ...formData, workDate: v }); resetInactivityTimer(); }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Start</Label>
                <TimeInput
                  value={formData.timeStart}
                  onChange={(v) => { setFormData({ ...formData, timeStart: v }); resetInactivityTimer(); }}
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-medium">End</Label>
                <TimeInput
                  value={formData.timeEnd}
                  onChange={(v) => { setFormData({ ...formData, timeEnd: v }); resetInactivityTimer(); }}
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Pause (min)</Label>
              <Input
                type="number"
                min="0"
                value={formData.pauseMinutes}
                onChange={(e) => { setFormData({ ...formData, pauseMinutes: parseInt(e.target.value) || 0 }); resetInactivityTimer(); }}
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => { setFormData({ ...formData, notes: e.target.value }); resetInactivityTimer(); }}
                placeholder="Optional notes..."
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                Net: <strong className="text-foreground text-base">{netHours}h</strong>
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={resetToGrid}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  ) : (
                    <Clock className="h-4 w-4 mr-2" />
                  )}
                  Log Time
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Staff grid (default state)
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">{hospitalName}</h1>
            <p className="text-sm text-muted-foreground">Tap your name to log work time</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b bg-card">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Staff grid */}
      <div className="p-4 flex-1">
        {filteredStaff.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No staff found
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredStaff.map((staff) => (
              <Card
                key={staff.id}
                className={`transition-all ${
                  staff.hasPinSet
                    ? "cursor-pointer hover:border-primary/50 hover:shadow-md active:scale-[0.98]"
                    : "opacity-50 cursor-not-allowed"
                }`}
                onClick={() => handleStaffClick(staff)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold">
                    {staff.profileImageUrl ? (
                      <img
                        src={staff.profileImageUrl}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      getInitials(staff.firstName, staff.lastName)
                    )}
                  </div>
                  <div className="font-medium text-sm leading-tight">
                    {staff.firstName} {staff.lastName}
                  </div>
                  {!staff.hasPinSet && (
                    <span className="text-xs text-muted-foreground">No PIN set</span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
