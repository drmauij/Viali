# Calendar Patient Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable search-by-patient-name feature to both the OP Calendar and Clinic Appointments Calendar, with server-side search across all dates, inline results dropdown, and navigation to the matched surgery/appointment.

**Architecture:** Two new lightweight API endpoints (one for surgeries, one for appointments) that join with the patients table and return search results with display context. A single shared `CalendarSearch` React component handles the expand/collapse icon, debounced input, dropdown results, and selection callback. Each parent page (OpList, Appointments) wires up the component and handles navigation + dialog opening.

**Tech Stack:** React, TanStack Query, Drizzle ORM, Express, shadcn/ui components, lucide-react icons

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `client/src/components/shared/CalendarSearch.tsx` | Shared search icon → input → dropdown component |
| Modify | `server/routes/anesthesia/surgeries.ts` | Add `GET /api/anesthesia/surgeries/search` endpoint |
| Modify | `server/routes/clinic.ts` | Add `GET /api/clinic/:hospitalId/appointments/search` endpoint |
| Modify | `client/src/components/anesthesia/OPCalendar.tsx` | Add CalendarSearch to header, expose `onSearchSelect` prop |
| Modify | `client/src/pages/anesthesia/OpList.tsx` | Handle search select → navigate date + open surgery summary |
| Modify | `client/src/components/clinic/ClinicCalendar.tsx` | Add CalendarSearch to header, expose `onSearchSelect` prop |
| Modify | `client/src/pages/clinic/Appointments.tsx` | Handle search select → navigate date + open appointment dialog |

---

### Task 1: Surgery Search API Endpoint

**Files:**
- Modify: `server/routes/anesthesia/surgeries.ts`

- [ ] **Step 1: Add the search endpoint**

Add this route after the existing `GET /api/anesthesia/surgeries` route in `server/routes/anesthesia/surgeries.ts`:

```typescript
// Search surgeries by patient name (across all dates)
router.get('/api/anesthesia/surgeries/search', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId, q } = req.query;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const query = (q as string || "").trim();
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const term = `%${query}%`;

    const results = await db
      .select({
        id: surgeries.id,
        patientFirstName: patients.firstName,
        patientSurname: patients.surname,
        plannedDate: surgeries.plannedDate,
        startTime: surgeries.startTime,
        plannedSurgery: surgeries.plannedSurgery,
        roomName: surgeryRooms.name,
        patientId: surgeries.patientId,
      })
      .from(surgeries)
      .leftJoin(patients, eq(surgeries.patientId, patients.id))
      .leftJoin(surgeryRooms, eq(surgeries.surgeryRoomId, surgeryRooms.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId as string),
          or(
            ilike(patients.firstName, term),
            ilike(patients.surname, term),
          ),
        ),
      )
      .orderBy(desc(surgeries.plannedDate))
      .limit(20);

    return res.json(results.map(r => ({
      id: r.id,
      patientId: r.patientId,
      patientName: [r.patientFirstName, r.patientSurname].filter(Boolean).join(" "),
      date: r.plannedDate,
      time: r.startTime || null,
      procedure: r.plannedSurgery,
      room: r.roomName || null,
    })));
  } catch (error) {
    logger.error("Surgery search error:", error);
    return res.status(500).json({ message: "Search failed" });
  }
});
```

Note: Check the existing imports at the top of the file. You will need `db` from `"../../db"`, `patients`, `surgeries`, `surgeryRooms` from `@shared/schema`, and `ilike`, `or`, `and`, `eq`, `desc` from `drizzle-orm`. Add any that are missing.

- [ ] **Step 2: Verify the endpoint works**

Run:
```bash
curl -s "http://localhost:5000/api/anesthesia/surgeries/search?hospitalId=<TEST_HOSPITAL_ID>&q=test" | jq .
```
Expected: JSON array (possibly empty if no matching patients)

- [ ] **Step 3: Commit**

```bash
git add server/routes/anesthesia/surgeries.ts
git commit -m "feat: add surgery search by patient name endpoint"
```

---

### Task 2: Appointment Search API Endpoint

**Files:**
- Modify: `server/routes/clinic.ts`

- [ ] **Step 1: Add the search endpoint**

Add this route in `server/routes/clinic.ts` near the existing appointments endpoint:

```typescript
// Search appointments by patient name (across all dates)
router.get('/api/clinic/:hospitalId/appointments/search', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const query = (req.query.q as string || "").trim();

    if (!query || query.length < 2) {
      return res.json([]);
    }

    const term = `%${query}%`;

    const results = await db
      .select({
        id: clinicAppointments.id,
        patientFirstName: patients.firstName,
        patientSurname: patients.surname,
        appointmentDate: clinicAppointments.appointmentDate,
        startTime: clinicAppointments.startTime,
        providerFirstName: users.firstName,
        providerLastName: users.lastName,
        serviceName: clinicServices.name,
      })
      .from(clinicAppointments)
      .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
      .leftJoin(users, eq(clinicAppointments.providerId, users.id))
      .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
      .where(
        and(
          eq(clinicAppointments.hospitalId, hospitalId),
          or(
            ilike(patients.firstName, term),
            ilike(patients.surname, term),
          ),
        ),
      )
      .orderBy(desc(clinicAppointments.appointmentDate))
      .limit(20);

    return res.json(results.map(r => ({
      id: r.id,
      patientName: [r.patientFirstName, r.patientSurname].filter(Boolean).join(" "),
      date: r.appointmentDate,
      time: r.startTime,
      providerName: [r.providerFirstName, r.providerLastName].filter(Boolean).join(" "),
      serviceName: r.serviceName || null,
    })));
  } catch (error) {
    logger.error("Appointment search error:", error);
    return res.status(500).json({ message: "Search failed" });
  }
});
```

Note: Check existing imports. You will need `db` from `"../db"`, `clinicAppointments`, `patients`, `users`, `clinicServices` from `@shared/schema`, and `ilike`, `or`, `and`, `eq`, `desc` from `drizzle-orm`. Add any that are missing.

- [ ] **Step 2: Verify the endpoint works**

Run:
```bash
curl -s "http://localhost:5000/api/clinic/<TEST_HOSPITAL_ID>/appointments/search?q=test" | jq .
```
Expected: JSON array (possibly empty if no matching patients)

- [ ] **Step 3: Commit**

```bash
git add server/routes/clinic.ts
git commit -m "feat: add appointment search by patient name endpoint"
```

---

### Task 3: CalendarSearch Shared Component

**Files:**
- Create: `client/src/components/shared/CalendarSearch.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface CalendarSearchResult {
  id: string;
  patientName: string;
  date: string;
  time: string | null;
  context: string; // provider name for appointments, procedure + room for surgeries
}

interface CalendarSearchProps {
  type: "appointments" | "surgeries";
  hospitalId: string;
  onSelect: (result: CalendarSearchResult) => void;
  onClear: () => void;
}

export default function CalendarSearch({ type, hospitalId, onSelect, onClear }: CalendarSearchProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [debouncedQuery]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const searchUrl = type === "surgeries"
    ? `/api/anesthesia/surgeries/search?hospitalId=${hospitalId}&q=${encodeURIComponent(debouncedQuery)}`
    : `/api/clinic/${hospitalId}/appointments/search?q=${encodeURIComponent(debouncedQuery)}`;

  const { data: rawResults = [], isLoading } = useQuery<any[]>({
    queryKey: [searchUrl],
    enabled: debouncedQuery.length >= 2,
  });

  // Map raw API results to CalendarSearchResult
  const results: CalendarSearchResult[] = rawResults.map((r: any) => ({
    id: r.id,
    patientName: r.patientName,
    date: r.date,
    time: r.time || r.startTime || null,
    context: type === "surgeries"
      ? [r.procedure, r.room].filter(Boolean).join(" · ")
      : [r.providerName, r.serviceName].filter(Boolean).join(" · "),
  }));

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setSelectedIndex(-1);
    onClear();
  }, [onClear]);

  const handleSelect = useCallback((result: CalendarSearchResult) => {
    onSelect(result);
    setIsOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setSelectedIndex(-1);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  }, [results, selectedIndex, handleClose, handleSelect]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="h-8 w-8 sm:h-9 sm:w-9 p-0"
        data-testid="button-calendar-search"
      >
        <Search className="h-3 w-3 sm:h-4 sm:w-4" />
      </Button>
    );
  }

  return (
    <div ref={containerRef} className="relative" data-testid="calendar-search">
      <div className="flex items-center gap-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('calendarSearch.placeholder', 'Search patient...')}
            className="h-8 sm:h-9 w-48 sm:w-64 pl-8 pr-8 text-sm"
            data-testid="input-calendar-search"
          />
          {query && (
            <button
              onClick={handleClose}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="button-calendar-search-clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown results */}
      {isOpen && debouncedQuery.length >= 2 && (
        <div className="absolute top-full left-0 mt-1 w-72 sm:w-80 bg-popover border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto"
             data-testid="calendar-search-results">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="py-4 px-3 text-sm text-muted-foreground text-center">
              {t('calendarSearch.noResults', 'No results found')}
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                onClick={() => handleSelect(result)}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b last:border-b-0",
                  selectedIndex === index && "bg-accent"
                )}
                data-testid={`search-result-${index}`}
              >
                <div className="font-medium text-sm">{result.patientName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(result.date)}
                  {result.time && ` · ${result.time}`}
                  {result.context && ` — ${result.context}`}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit --pretty 2>&1 | grep -i "CalendarSearch" || echo "No CalendarSearch errors"
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/shared/CalendarSearch.tsx
git commit -m "feat: add CalendarSearch shared component"
```

---

### Task 4: Integrate Search into OP Calendar + OpList

**Files:**
- Modify: `client/src/components/anesthesia/OPCalendar.tsx` (props + header)
- Modify: `client/src/pages/anesthesia/OpList.tsx` (handle search select)

- [ ] **Step 1: Add `onSearchSelect` prop to OPCalendar**

In `OPCalendar.tsx`, update the `OPCalendarProps` interface (around line 110):

```typescript
interface OPCalendarProps {
  onEventClick?: (surgeryId: string, patientId: string | null) => void;
  onEditSurgery?: (surgeryId: string) => void;
  onDropFromOutside?: (date: Date, roomId?: string) => void;
  tapSelectedRequest?: any;
  onTapSlotWithSelection?: (date: Date, roomId?: string) => void;
  onSearchSelect?: (surgeryId: string, patientId: string | null, date: Date) => void;
}
```

Update the function signature (around line 249) to destructure `onSearchSelect`:

```typescript
export default function OPCalendar({ onEventClick, onEditSurgery, onDropFromOutside, tapSelectedRequest, onTapSlotWithSelection, onSearchSelect }: OPCalendarProps) {
```

- [ ] **Step 2: Add CalendarSearch to OPCalendar header**

Import at the top of `OPCalendar.tsx`:

```typescript
import CalendarSearch from "@/components/shared/CalendarSearch";
import type { CalendarSearchResult } from "@/components/shared/CalendarSearch";
```

Add a ref to save the pre-search date, near the other state declarations (around line 260):

```typescript
const preSearchDateRef = useRef<Date | null>(null);
```

Make sure `useRef` is in the import from "react" at line 1.

Add the search handlers near the other callbacks:

```typescript
const handleSearchSelect = useCallback((result: CalendarSearchResult) => {
  preSearchDateRef.current = selectedDate;
  const newDate = new Date(result.date + "T00:00:00");
  setSelectedDate(newDate);
  if (onSearchSelect) {
    onSearchSelect(result.id, null, newDate);
  }
}, [selectedDate, onSearchSelect]);

const handleSearchClear = useCallback(() => {
  if (preSearchDateRef.current) {
    setSelectedDate(preSearchDateRef.current);
    preSearchDateRef.current = null;
  }
}, []);
```

In the header JSX (around line 1394, inside the `<div className="flex gap-1.5 sm:gap-2 ml-auto flex-wrap">`), add CalendarSearch as the first child:

```tsx
{activeHospital && (
  <CalendarSearch
    type="surgeries"
    hospitalId={activeHospital.id}
    onSelect={handleSearchSelect}
    onClear={handleSearchClear}
  />
)}
```

- [ ] **Step 3: Wire up OpList to handle search select**

In `OpList.tsx`, add a handler and pass it to OPCalendar.

Add the handler near the other handlers (around line 170):

```typescript
const handleSearchSelect = (surgeryId: string, _patientId: string | null, _date: Date) => {
  setSelectedSurgeryId(surgeryId);
  setSelectedPatientId(null); // Will be resolved when summary opens
  setSummaryOpen(true);
};
```

Note: The search result returns a `patientId` from the API but the `CalendarSearchResult` interface doesn't currently include it. We pass `null` here because the surgery summary dialog fetches patient data from the surgery record anyway.

Pass it to the OPCalendar component (find the `<OPCalendar` JSX):

```tsx
onSearchSelect={handleSearchSelect}
```

- [ ] **Step 4: Verify it compiles**

Run:
```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/anesthesia/OPCalendar.tsx client/src/pages/anesthesia/OpList.tsx
git commit -m "feat: integrate patient search into OP calendar"
```

---

### Task 5: Integrate Search into Clinic Calendar + Appointments

**Files:**
- Modify: `client/src/components/clinic/ClinicCalendar.tsx` (props + header)
- Modify: `client/src/pages/clinic/Appointments.tsx` (handle search select)

- [ ] **Step 1: Add `onSearchSelect` prop to ClinicCalendar**

In `ClinicCalendar.tsx`, update the `ClinicCalendarProps` interface (around line 192):

Add to the interface:
```typescript
onSearchSelect?: (appointmentId: string, date: Date) => void;
```

Update the destructured props (around line 206) to include `onSearchSelect`.

- [ ] **Step 2: Add CalendarSearch to ClinicCalendar header**

Import at the top of `ClinicCalendar.tsx`:

```typescript
import CalendarSearch from "@/components/shared/CalendarSearch";
import type { CalendarSearchResult } from "@/components/shared/CalendarSearch";
```

Add a ref to save the pre-search date, near the other state declarations:

```typescript
const preSearchDateRef = useRef<Date | null>(null);
```

Add the search handlers:

```typescript
const handleSearchSelect = useCallback((result: CalendarSearchResult) => {
  preSearchDateRef.current = selectedDate;
  const newDate = new Date(result.date + "T00:00:00");
  setSelectedDate(newDate);
  if (onSearchSelect) {
    onSearchSelect(result.id, newDate);
  }
}, [selectedDate, onSearchSelect]);

const handleSearchClear = useCallback(() => {
  if (preSearchDateRef.current) {
    setSelectedDate(preSearchDateRef.current);
    preSearchDateRef.current = null;
  }
}, []);
```

In the header JSX (around line 1422, inside `<div className="flex gap-1.5 sm:gap-2 ml-auto flex-wrap">`), add CalendarSearch before the Filter button:

```tsx
<CalendarSearch
  type="appointments"
  hospitalId={hospitalId}
  onSelect={handleSearchSelect}
  onClear={handleSearchClear}
/>
```

- [ ] **Step 3: Wire up Appointments page to handle search select**

In `Appointments.tsx`, add a handler and pass it to ClinicCalendar.

Add the handler (near `handleEventClick` around line 238):

```typescript
const handleSearchSelect = async (appointmentId: string, _date: Date) => {
  // Fetch the full appointment to open the detail dialog
  try {
    const response = await fetch(`/api/clinic/${hospitalId}/appointments/${appointmentId}`, {
      credentials: 'include',
    });
    if (response.ok) {
      const appointment = await response.json();
      setSelectedAppointment(appointment);
      setDetailDialogOpen(true);
    }
  } catch (error) {
    console.error("Failed to fetch appointment:", error);
  }
};
```

Note: Check if there's an existing endpoint `GET /api/clinic/:hospitalId/appointments/:id`. If not, use the appointments list data or add a simple fetch-by-id endpoint. The appointments list is date-range-scoped, so the searched appointment may not be in the current `appointments` array — hence the direct fetch.

Pass it to the ClinicCalendar component:

```tsx
onSearchSelect={handleSearchSelect}
```

- [ ] **Step 4: Check if single-appointment fetch endpoint exists**

Search for a `GET /api/clinic/:hospitalId/appointments/:id` or similar route. If it doesn't exist, add one in `server/routes/clinic.ts`:

```typescript
router.get('/api/clinic/:hospitalId/appointments/:appointmentId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId, appointmentId } = req.params;
    const appointment = await storage.getClinicAppointmentById(appointmentId);
    if (!appointment || appointment.hospitalId !== hospitalId) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    res.json(appointment);
  } catch (error) {
    logger.error("Error fetching appointment:", error);
    res.status(500).json({ message: "Failed to fetch appointment" });
  }
});
```

Also verify that `storage.getClinicAppointmentById` exists. If not, it will need to be added to the storage layer as a simple `select ... where id = ?` query that joins patient, provider, and service data (matching the shape of `AppointmentWithDetails`).

- [ ] **Step 5: Verify it compiles**

Run:
```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/components/clinic/ClinicCalendar.tsx client/src/pages/clinic/Appointments.tsx server/routes/clinic.ts
git commit -m "feat: integrate patient search into clinic appointments calendar"
```

---

### Task 6: Manual QA & Final Cleanup

- [ ] **Step 1: Test OP Calendar search**

1. Open the OP Calendar page
2. Click the search icon — verify it expands to an input
3. Type a patient name (2+ chars) — verify dropdown appears with results
4. Click a result — verify calendar navigates to that date and surgery summary opens
5. Close the dialog, click X on search — verify calendar returns to original date
6. Press Escape — verify search closes

- [ ] **Step 2: Test Clinic Appointments search**

1. Open the Appointments page
2. Click the search icon — verify it expands
3. Type a patient name — verify results show with provider names
4. Click a result — verify calendar navigates and appointment detail dialog opens
5. Clear search — verify calendar returns to original date

- [ ] **Step 3: Test edge cases**

- Type 1 character — no API call should fire
- Type a name with no matches — "No results found" message
- Rapid typing — only one API call after 300ms debounce
- Click outside the search — it should close and restore date
- Keyboard navigation: arrow keys + enter to select

- [ ] **Step 4: Run lint and typecheck**

```bash
npm run check
```
Expected: Clean pass

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address QA issues from calendar search testing"
```
