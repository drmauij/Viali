# Calendar Patient Search

Search appointments and surgeries by patient name from within the OP Calendar and Clinic Appointments Calendar.

## UX Flow

1. **Collapsed state**: A search icon (magnifying glass) sits in the calendar header bar, alongside existing controls (date nav, view switcher, provider filter).
2. **Expand**: Clicking the icon animates an inline search input open (slide-right or expand). Focus lands in the input automatically.
3. **Typing**: After 2+ characters, a debounced (300ms) server query returns matching results displayed in a dropdown below the input.
4. **Results dropdown**: Each result shows:
   - Patient name (bold)
   - Date and time
   - Context line: provider name (appointments) or procedure + room (surgeries)
5. **Select**: Clicking a result:
   - Saves the current calendar date and view to local state
   - Navigates the calendar to the result's date
   - Opens the appropriate detail dialog (`AppointmentDetailDialog` for appointments, `EditSurgeryDialog` for surgeries)
6. **Clear / dismiss**: Clicking the X or pressing Escape:
   - Clears the search input and results
   - Restores the previously saved calendar date and view
   - Collapses the search back to the icon

## Shared Component

A single `CalendarSearch` component is used in both calendars.

```ts
interface CalendarSearchResult {
  id: string;
  patientName: string;
  date: string;          // ISO date string
  time: string;          // e.g. "10:00"
  context: string;       // provider name OR procedure + room
}

interface CalendarSearchProps {
  type: "appointments" | "surgeries";
  hospitalId: string;
  onSelect: (result: { date: Date; id: string }) => void;
  onClear: () => void;
}
```

### Behavior

- Debounce: 300ms after last keystroke before firing API request
- Minimum query length: 2 characters
- Loading state: spinner inside dropdown while fetching
- Empty state: "No results found" message
- Max results: 20 (server-side limit)
- Keyboard: Arrow keys to navigate results, Enter to select, Escape to dismiss

## API Endpoints

### `GET /api/clinic/:hospitalId/appointments/search?q=<query>`

Searches appointments by patient first or last name (case-insensitive, partial match).

**Response:** Array of:
```json
{
  "id": "appointment-uuid",
  "patientName": "Mario Rossi",
  "date": "2026-03-28",
  "time": "10:00",
  "providerName": "Dr. Bianchi"
}
```

### `GET /api/anesthesia/surgeries/search?q=<query>&hospitalId=<id>`

Searches surgeries by patient first or last name (case-insensitive, partial match).

**Response:** Array of:
```json
{
  "id": "surgery-uuid",
  "patientName": "Mario Rossi",
  "date": "2026-04-02",
  "time": "08:30",
  "procedureName": "Arthroscopy",
  "room": "Room 2"
}
```

Both endpoints:
- Return max 20 results
- Order by date descending (most recent first)
- Search across all dates (not limited to current view)
- Require authentication

## Integration

### ClinicCalendar.tsx

- Add `CalendarSearch` to the header row
- On select: call `setSelectedDate(result.date)`, then open `AppointmentDetailDialog` with the appointment ID
- On clear: restore previous `selectedDate`

### OPCalendar.tsx

- Add `CalendarSearch` to the header row
- On select: navigate calendar to `result.date`, then open `EditSurgeryDialog` with the surgery ID
- On clear: restore previous calendar date

## State Preservation

Before navigating on search select:
1. Save `{ date: currentDate, view: currentView }` to a ref
2. Navigate to result date
3. On clear, restore from ref

No persistence across page reloads — this is ephemeral UI state only.

## File Structure

- `client/src/components/shared/CalendarSearch.tsx` — the shared search component
- Server routes added to existing clinic and anesthesia route files
