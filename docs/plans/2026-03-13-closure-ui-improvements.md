# Closure UI Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make closures visible and regionally-formatted throughout the app — fix the date picker in the closure dialog and add closure overlays to the OP Plan calendar.

**Architecture:** Two independent UI changes: (1) swap native date inputs for the existing `DateInput` component in the closure dialog, (2) add closure detection + visual overlays to the `OPCalendar` day and month views.

**Tech Stack:** React, react-big-calendar, Tailwind CSS, existing `DateInput` component

---

### Task 1: Replace native date inputs with DateInput in closure dialog

**Files:**
- Modify: `client/src/pages/admin/Hospital.tsx`

**Step 1: Add DateInput import**

At line 1 area, add import:

```tsx
import { DateInput } from "@/components/ui/date-input";
```

**Step 2: Replace Start Date input (line ~3161)**

Replace:
```tsx
<Input
  type="date"
  value={closureForm.startDate}
  onChange={(e) => {
    const newStart = e.target.value;
    setClosureForm({
      ...closureForm,
      startDate: newStart,
      endDate: closureForm.endDate && closureForm.endDate < newStart ? newStart : closureForm.endDate,
    });
  }}
/>
```

With:
```tsx
<DateInput
  value={closureForm.startDate}
  onChange={(isoDate) => {
    setClosureForm({
      ...closureForm,
      startDate: isoDate,
      endDate: closureForm.endDate && closureForm.endDate < isoDate ? isoDate : closureForm.endDate,
    });
  }}
  placeholder={t("admin.pickDate", "Pick date")}
/>
```

**Step 3: Replace End Date input (line ~3176)**

Replace:
```tsx
<Input
  type="date"
  value={closureForm.endDate}
  onChange={(e) => setClosureForm({ ...closureForm, endDate: e.target.value })}
  min={closureForm.startDate || undefined}
/>
```

With:
```tsx
<DateInput
  value={closureForm.endDate}
  onChange={(isoDate) => setClosureForm({ ...closureForm, endDate: isoDate })}
  min={closureForm.startDate || undefined}
  placeholder={t("admin.pickDate", "Pick date")}
/>
```

**Step 4: Verify**

Run: `npm run check`

**Step 5: Commit**

```
feat: use DateInput for closure dialog date fields (respects regional format)
```

---

### Task 2: Add closure overlay to OP Plan day view

**Files:**
- Modify: `client/src/components/anesthesia/OPCalendar.tsx`

**Step 1: Add dayClosure computed value**

Near existing closure logic (~line 993), add a memo for detecting if the currently selected day is closed:

```tsx
const dayClosure = useMemo(() => {
  const dateStr = selectedDate.toISOString().split('T')[0];
  return closures.find(c => dateStr >= c.startDate && dateStr <= c.endDate) || null;
}, [selectedDate, closures]);
```

**Step 2: Wrap calendar in relative container and add overlay**

Around line 1584 where `<DragAndDropCalendar>` is rendered, wrap it:

```tsx
<div className="relative h-full">
  <DragAndDropCalendar
    ...existing props...
  />
  {currentView === "day" && dayClosure && (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-amber-100/70 dark:bg-amber-900/30 rounded-lg">
      <div className="bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-700 rounded-xl px-8 py-6 text-center shadow-lg">
        <i className="fas fa-calendar-xmark text-amber-600 dark:text-amber-400 text-4xl mb-3"></i>
        <div className="text-lg font-semibold text-amber-800 dark:text-amber-200">
          {t("opCalendar.clinicClosed", "Clinic Closed")}
        </div>
        <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">{dayClosure.name}</div>
      </div>
    </div>
  )}
</div>
```

**Step 3: Verify**

Run: `npm run check`

**Step 4: Commit**

```
feat: show full closure overlay on OP Plan day view
```

---

### Task 3: Add closure indicators to OP Plan month view

**Files:**
- Modify: `client/src/components/anesthesia/OPCalendar.tsx`

**Step 1: Update DateCellWrapper to detect closures**

Modify the `DateCellWrapper` component (~line 1258) to check if the cell's date falls in a closure:

```tsx
const DateCellWrapper = useCallback(({ value, children }: { value: Date; children: React.ReactNode }) => {
  const dateStr = value.toISOString().split('T')[0];
  const cellClosure = closures.find(c => dateStr >= c.startDate && dateStr <= c.endDate);

  return (
    <div
      className={cn(
        "rbc-day-bg cursor-pointer hover:bg-accent/50 transition-colors",
        cellClosure && "bg-amber-50 dark:bg-amber-900/20"
      )}
      onClick={() => {
        if (currentView === "month") {
          setSelectedDate(value);
          setCurrentView("day");
        }
      }}
      data-testid={`day-cell-${value.toISOString()}`}
    >
      {children}
    </div>
  );
}, [currentView, closures]);
```

**Step 2: Update MonthDateHeader to show closure label**

Modify the `MonthDateHeader` component (~line 1228) to show a "Closed" label:

```tsx
const MonthDateHeader = useCallback(({ date }: { date: Date }) => {
  const dayEvents = calendarEvents.filter(event => {
    const eventDate = new Date(event.start);
    return eventDate.toDateString() === date.toDateString();
  });

  const hasEvents = dayEvents.length > 0;
  const dateStr = date.toISOString().split('T')[0];
  const cellClosure = closures.find(c => dateStr >= c.startDate && dateStr <= c.endDate);

  return (
    <div className="rbc-date-cell">
      <button
        type="button"
        className="rbc-button-link"
        onClick={() => {
          setSelectedDate(date);
          setCurrentView("day");
        }}
      >
        {date.getDate()}
      </button>
      {cellClosure ? (
        <div className="flex justify-center mt-1">
          <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-1 rounded">
            {t("opCalendar.closed", "Closed")}
          </span>
        </div>
      ) : hasEvents ? (
        <div className="flex justify-center mt-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" data-testid={`indicator-${date.toISOString()}`}></div>
        </div>
      ) : null}
    </div>
  );
}, [calendarEvents, closures, t]);
```

**Step 3: Ensure `cn` utility is imported**

Check if `cn` is already imported in OPCalendar.tsx. If not, add:

```tsx
import { cn } from "@/lib/utils";
```

**Step 4: Verify**

Run: `npm run check`

**Step 5: Commit**

```
feat: show closure indicators on OP Plan month view cells
```

---

### Task 4: Final verification

**Step 1:** Run `npm run check` — must pass clean

**Step 2:** Manual test checklist:
- Settings > Closures: add a closure — dates should show in regional format (not MM/DD/YYYY)
- OP Plan day view: navigate to a closed date — full amber overlay with "Clinic Closed"
- OP Plan month view: closed dates show amber background + "Closed" label
- OP Plan week view (TimelineWeekView): existing amber indicators still work (regression check)
