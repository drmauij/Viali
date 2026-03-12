# Appointment UI Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add video appointment support, notes preview on calendar cards, hover time indicator, and patient detail appointments tab.

**Architecture:** Schema-first approach — add DB fields, update server validation, then progressively update UI components. Extract shared appointment dialog for reuse across calendar page and patient detail.

**Tech Stack:** Drizzle ORM, PostgreSQL, React, TanStack Query, Tailwind CSS, Lucide icons, react-big-calendar, shadcn/ui

---

## Task 1: Schema — Add video appointment fields

**Files:**
- Modify: `shared/schema.ts:4304-4306` (add fields after `notes`)
- Modify: `server/routes/clinic.ts:1856-1864` (update `updateAppointmentSchema`)

**Step 1: Add columns to schema**

In `shared/schema.ts`, after the `notes` field (line 4305), add:

```typescript
  // Video appointment
  isVideoAppointment: boolean("is_video_appointment").default(false),
  videoMeetingLink: text("video_meeting_link"),
```

**Step 2: Update server update schema**

In `server/routes/clinic.ts`, update `updateAppointmentSchema` (line 1856) to include:

```typescript
const updateAppointmentSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  appointmentDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().nullable().optional(),
  serviceId: z.string().nullable().optional(),
  providerId: z.string().optional(),
  isVideoAppointment: z.boolean().optional(),
  videoMeetingLink: z.string().nullable().optional(),
});
```

Note: `insertClinicAppointmentSchema` is auto-generated from the table via `createInsertSchema`, so no changes needed for the create endpoint.

**Step 3: Generate and fix migration**

```bash
npm run db:generate
```

Then verify the generated migration uses `ADD COLUMN IF NOT EXISTS`. The generated SQL should look like:

```sql
ALTER TABLE "clinic_appointments" ADD COLUMN IF NOT EXISTS "is_video_appointment" boolean DEFAULT false;
ALTER TABLE "clinic_appointments" ADD COLUMN IF NOT EXISTS "video_meeting_link" text;
```

**Step 4: Apply migration**

```bash
npm run db:migrate
```

**Step 5: Verify TypeScript**

```bash
npm run check
```

**Step 6: Commit**

```bash
git add shared/schema.ts server/routes/clinic.ts migrations/
git commit -m "feat: add video appointment schema fields (isVideoAppointment, videoMeetingLink)"
```

---

## Task 2: Video toggle in BookingDialog

**Files:**
- Modify: `client/src/pages/clinic/Appointments.tsx:768-1205` (BookingDialog function)

**Step 1: Add state variables**

After `const [notes, setNotes] = useState("");` (line 799), add:

```typescript
const [isVideoAppointment, setIsVideoAppointment] = useState(false);
const [videoMeetingLink, setVideoMeetingLink] = useState("");
```

**Step 2: Include in resetForm**

In `resetForm()` (line 958), add:

```typescript
setIsVideoAppointment(false);
setVideoMeetingLink("");
```

**Step 3: Include in handleSubmit payload**

In `handleSubmit()` (line 981), add to the mutation payload:

```typescript
isVideoAppointment,
videoMeetingLink: videoMeetingLink || null,
```

**Step 4: Add UI controls**

After the Notes textarea section (line 1183), add a video appointment section:

```tsx
<div className="flex items-center justify-between">
  <Label className="flex items-center gap-2">
    <Video className="h-4 w-4" />
    {t('appointments.videoAppointment', 'Video Appointment')}
  </Label>
  <Switch checked={isVideoAppointment} onCheckedChange={setIsVideoAppointment} />
</div>
{isVideoAppointment && (
  <div>
    <Label>{t('appointments.videoMeetingLink', 'Meeting Link')}</Label>
    <Input
      value={videoMeetingLink}
      onChange={(e) => setVideoMeetingLink(e.target.value)}
      placeholder="https://zoom.us/j/... or https://meet.google.com/..."
      data-testid="input-booking-video-link"
    />
  </div>
)}
```

**Step 5: Add imports**

Add `Video` to the lucide-react imports, and import `Switch` from `@/components/ui/switch`.

**Step 6: Verify**

```bash
npm run check
```

**Step 7: Commit**

```bash
git add client/src/pages/clinic/Appointments.tsx
git commit -m "feat: add video appointment toggle to booking dialog"
```

---

## Task 3: Video fields in appointment detail dialog

**Files:**
- Modify: `client/src/pages/clinic/Appointments.tsx:431-650` (detail dialog section)

**Step 1: Show video badge in detail dialog**

After the status badge section (line 594), add a video section:

```tsx
{selectedAppointment.isVideoAppointment && (
  <div>
    <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1">
      <Video className="h-3 w-3" />
      {t('appointments.videoAppointment', 'Video Appointment')}
    </p>
    {selectedAppointment.videoMeetingLink && (
      <a
        href={selectedAppointment.videoMeetingLink}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary underline break-all"
      >
        {selectedAppointment.videoMeetingLink}
      </a>
    )}
  </div>
)}
```

**Step 2: Add video editing to edit mode**

In the edit mode state variables (around lines 97-101), add:

```typescript
const [editIsVideo, setEditIsVideo] = useState(false);
const [editVideoLink, setEditVideoLink] = useState('');
```

In `enterEditMode` function, populate these from selected appointment. In `handleSaveReschedule`, include `isVideoAppointment` and `videoMeetingLink` in the PATCH payload.

Add toggle + input in the edit mode UI section of the detail card.

**Step 3: Verify**

```bash
npm run check
```

**Step 4: Commit**

```bash
git add client/src/pages/clinic/Appointments.tsx
git commit -m "feat: show video appointment badge and link in detail dialog"
```

---

## Task 4: Video icon on calendar day view (react-big-calendar EventComponent)

**Files:**
- Modify: `client/src/components/clinic/ClinicCalendar.tsx:38-58` (CalendarEvent interface)
- Modify: `client/src/components/clinic/ClinicCalendar.tsx:718-731` (event mapping)
- Modify: `client/src/components/clinic/ClinicCalendar.tsx:1259-1269` (EventComponent render)

**Step 1: Add field to CalendarEvent interface**

Add to the `CalendarEvent` interface (line 38):

```typescript
isVideoAppointment?: boolean;
```

**Step 2: Map field in event creation**

In the appointment-to-event mapping (line 718), add:

```typescript
isVideoAppointment: appt.isVideoAppointment || false,
```

**Step 3: Show icon in EventComponent**

In the appointment render section (line 1260-1269), add Video icon:

```tsx
const isCancelled = event.status === 'cancelled';
return (
  <div className="flex flex-col h-full p-1" data-testid={`appointment-event-${event.appointmentId}`}>
    <div className={`font-bold text-xs ${isCancelled ? 'line-through' : ''} flex items-center gap-1`}>
      {event.isVideoAppointment && <Video className="w-3 h-3 flex-shrink-0" />}
      {event.serviceName || t('appointments.appointment', 'Appointment')}
    </div>
    <div className={`text-xs ${isCancelled ? 'line-through' : ''}`}>
      {event.patientName}
    </div>
  </div>
);
```

**Step 4: Add Video import**

Add `Video` to the lucide-react import in `ClinicCalendar.tsx` (line 12).

**Step 5: Verify**

```bash
npm run check
```

**Step 6: Commit**

```bash
git add client/src/components/clinic/ClinicCalendar.tsx
git commit -m "feat: show video icon on calendar day view appointment cards"
```

---

## Task 5: Video icon on week view appointment cards

**Files:**
- Modify: `client/src/components/clinic/AppointmentsWeekView.tsx:488-509` (appointment card render)

**Step 1: Add Video icon to week view cards**

In the appointment card (line 501), modify the first line:

```tsx
<div className="font-semibold truncate flex items-center gap-1">
  {item.appt!.isVideoAppointment && <Video className="w-3 h-3 flex-shrink-0" />}
  {item.appt!.startTime} {getPatientName(item.appt!)}
</div>
```

**Step 2: Add Video import**

Add `Video` to imports from lucide-react.

**Step 3: Verify**

```bash
npm run check
```

**Step 4: Commit**

```bash
git add client/src/components/clinic/AppointmentsWeekView.tsx
git commit -m "feat: show video icon on week view appointment cards"
```

---

## Task 6: Notes preview on day view cards (EventComponent)

**Files:**
- Modify: `client/src/components/clinic/ClinicCalendar.tsx:1259-1269` (EventComponent)

**Step 1: Add notes line to EventComponent**

Update the appointment render to include a third line for notes, using CSS overflow to hide if card is too short:

```tsx
const isCancelled = event.status === 'cancelled';
return (
  <div className="flex flex-col h-full p-1 overflow-hidden" data-testid={`appointment-event-${event.appointmentId}`}>
    <div className={`font-bold text-xs ${isCancelled ? 'line-through' : ''} flex items-center gap-1`}>
      {event.isVideoAppointment && <Video className="w-3 h-3 flex-shrink-0" />}
      {event.serviceName || t('appointments.appointment', 'Appointment')}
    </div>
    <div className={`text-xs ${isCancelled ? 'line-through' : ''}`}>
      {event.patientName}
    </div>
    {event.notes && (
      <div className="text-[10px] text-muted-foreground truncate mt-0.5 opacity-70">
        {event.notes}
      </div>
    )}
  </div>
);
```

The `overflow-hidden` on the parent and `truncate` on notes ensures it only shows when space allows.

**Step 2: Verify**

```bash
npm run check
```

**Step 3: Commit**

```bash
git add client/src/components/clinic/ClinicCalendar.tsx
git commit -m "feat: show notes preview on day view appointment cards"
```

---

## Task 7: Notes preview on week view cards

**Files:**
- Modify: `client/src/components/clinic/AppointmentsWeekView.tsx:488-509` (appointment card render)

**Step 1: Add notes line to week view cards**

After the service name line, add notes preview with overflow handling:

```tsx
<div
  key={item.key}
  className={cn(
    "border-l-4 px-1.5 py-1 rounded text-xs cursor-pointer transition-all hover:shadow-md overflow-hidden",
    getStatusClass(item.appt!.status)
  )}
  ...
>
  <div className="font-semibold truncate flex items-center gap-1">
    {item.appt!.isVideoAppointment && <Video className="w-3 h-3 flex-shrink-0" />}
    {item.appt!.startTime} {getPatientName(item.appt!)}
  </div>
  {item.appt!.service?.name && (
    <div className="truncate opacity-80">
      {item.appt!.service.name}
    </div>
  )}
  {item.appt!.notes && (
    <div className="truncate opacity-60 text-[10px]">
      {item.appt!.notes}
    </div>
  )}
</div>
```

**Step 2: Verify**

```bash
npm run check
```

**Step 3: Commit**

```bash
git add client/src/components/clinic/AppointmentsWeekView.tsx
git commit -m "feat: show notes preview on week view appointment cards"
```

---

## Task 8: Hover time indicator on calendar day view

**Files:**
- Modify: `client/src/components/clinic/ClinicCalendar.tsx` (add mouse tracking logic + overlay)

This is the react-big-calendar day view. The time grid has a known structure: `.rbc-time-content` contains the time slots. We need to:

**Step 1: Add state for hover time**

Add state near the top of the ClinicCalendar component:

```typescript
const [hoverTime, setHoverTime] = useState<{ y: number; time: string } | null>(null);
const calendarContainerRef = useRef<HTMLDivElement>(null);
```

**Step 2: Add mouse tracking effect**

Add a `useEffect` that attaches `mousemove` and `mouseleave` handlers to `.rbc-time-content`:

```typescript
useEffect(() => {
  if (currentView !== 'day') {
    setHoverTime(null);
    return;
  }

  const container = calendarContainerRef.current;
  if (!container) return;

  const handleMouseMove = (e: MouseEvent) => {
    const timeContent = container.querySelector('.rbc-time-content');
    if (!timeContent) return;

    const rect = timeContent.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < 0 || y > rect.height) {
      setHoverTime(null);
      return;
    }

    // Calculate time from Y position
    // react-big-calendar default: min=0:00, max=23:59, step=15
    // The time content represents the full day range
    const totalMinutes = (y / rect.height) * 24 * 60;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes / 5) * 5; // round to 5 min
    const minutesInHour = minutes % 60;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutesInHour).padStart(2, '0')}`;

    setHoverTime({ y: y + rect.top - container.getBoundingClientRect().top, time: timeStr });
  };

  const handleMouseLeave = () => setHoverTime(null);

  const timeContent = container.querySelector('.rbc-time-content');
  if (timeContent) {
    timeContent.addEventListener('mousemove', handleMouseMove);
    timeContent.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      timeContent.removeEventListener('mousemove', handleMouseMove);
      timeContent.removeEventListener('mouseleave', handleMouseLeave);
    };
  }
}, [currentView]);
```

**Step 3: Render the hover line overlay**

Inside the calendar container div, add:

```tsx
{hoverTime && currentView === 'day' && (
  <div
    className="absolute left-0 right-0 pointer-events-none z-50 flex items-center"
    style={{ top: hoverTime.y }}
  >
    <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-sm font-mono whitespace-nowrap">
      {hoverTime.time}
    </span>
    <div className="flex-1 border-t border-dashed border-primary/60" />
  </div>
)}
```

Make sure the calendar container has `position: relative` (add `relative` to className if not already there).

**Step 4: Add ref to calendar container**

Find the outermost `<div>` that wraps the react-big-calendar and add `ref={calendarContainerRef}`.

**Step 5: Adjust for calendar min/max and step settings**

Check the actual `min` and `max` props passed to react-big-calendar to get the correct time range for the Y→time calculation. If `min` is e.g. 6:00 and `max` is 22:00, adjust the formula:

```typescript
const minHour = 6; // match the calendar's min prop
const maxHour = 22; // match the calendar's max prop
const totalRange = (maxHour - minHour) * 60;
const totalMinutes = minHour * 60 + (y / rect.height) * totalRange;
```

**Step 6: Verify**

```bash
npm run check
```

**Step 7: Commit**

```bash
git add client/src/components/clinic/ClinicCalendar.tsx
git commit -m "feat: add hover time indicator line on calendar day view"
```

---

## Task 9: Extract shared appointment detail dialog

**Files:**
- Create: `client/src/components/clinic/AppointmentDetailDialog.tsx`
- Modify: `client/src/pages/clinic/Appointments.tsx` (extract dialog, import shared version)

**Step 1: Extract the dialog**

Move the entire detail dialog JSX (lines 431-690 approx) plus its related state (`editMode`, `editDate`, `editStartTime`, `editEndTime`, `editProviderId`, `editIsVideo`, `editVideoLink`) and mutations (`updateAppointmentMutation`, `deleteAppointmentMutation`, `rescheduleAppointmentMutation`) into a new `AppointmentDetailDialog` component.

Props for the new component:

```typescript
interface AppointmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentWithDetails | null;
  hospitalId: string;
  unitId: string;
  providers: { id: string; firstName: string | null; lastName: string | null }[];
  onNavigateToPatient?: (patientId: string) => void;
}
```

**Step 2: Update Appointments.tsx to use the extracted component**

Replace the inline dialog with:

```tsx
<AppointmentDetailDialog
  open={detailDialogOpen}
  onOpenChange={(open) => { setDetailDialogOpen(open); }}
  appointment={selectedAppointment}
  hospitalId={hospitalId}
  unitId={unitId}
  providers={providers}
  onNavigateToPatient={(patientId) => {
    const moduleBase = activeHospital?.unitType === 'or' ? '/surgery'
      : activeHospital?.unitType === 'anesthesia' ? '/anesthesia'
      : '/clinic';
    setDetailDialogOpen(false);
    setTimeout(() => setLocation(`${moduleBase}/patients/${patientId}`), 150);
  }}
/>
```

**Step 3: Verify the calendar page still works**

```bash
npm run check
```

**Step 4: Commit**

```bash
git add client/src/components/clinic/AppointmentDetailDialog.tsx client/src/pages/clinic/Appointments.tsx
git commit -m "refactor: extract AppointmentDetailDialog into shared component"
```

---

## Task 10: Patient detail — Appointments tab

**Files:**
- Modify: `client/src/pages/anesthesia/PatientDetail.tsx:1905-1946` (add tab trigger)
- Modify: `client/src/pages/anesthesia/PatientDetail.tsx` (add TabsContent + appointments list)

**Step 1: Add tab trigger**

After the medications tab trigger (line 1937), add:

```tsx
<TabsTrigger value="appointments" data-testid="tab-appointments" className="whitespace-nowrap">
  {t('anesthesia.patientDetail.appointments', 'Appointments')}
  {patientAppointments.length > 0 && (
    <Badge variant="secondary" className="ml-1">{patientAppointments.length}</Badge>
  )}
</TabsTrigger>
```

**Step 2: Add data query**

Near other queries in PatientDetail, add:

```typescript
const { data: patientAppointments = [] } = useQuery<AppointmentWithDetails[]>({
  queryKey: [`/api/clinic/${hospitalId}/appointments`, { patientId: id }],
  queryFn: async () => {
    const response = await fetch(
      `/api/clinic/${hospitalId}/appointments?patientId=${id}`,
      { credentials: 'include' }
    );
    if (!response.ok) throw new Error('Failed to fetch appointments');
    return response.json();
  },
  enabled: !!hospitalId && !!id,
});
```

**Step 3: Add TabsContent with appointments list**

```tsx
<TabsContent value="appointments" className="mt-0 space-y-4">
  <div className="flex justify-end">
    <Button
      size="sm"
      onClick={() => {
        setNewAppointmentOpen(true);
      }}
    >
      <Plus className="h-4 w-4 mr-1" />
      {t('appointments.bookNew', 'Book New Appointment')}
    </Button>
  </div>

  {patientAppointments.length === 0 ? (
    <div className="text-center text-muted-foreground py-8">
      {t('appointments.noAppointments', 'No appointments found')}
    </div>
  ) : (
    <div className="space-y-2">
      {[...patientAppointments]
        .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate) || (b.startTime || '').localeCompare(a.startTime || ''))
        .map((appt) => (
          <div
            key={appt.id}
            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 cursor-pointer"
            onClick={() => {
              setSelectedAppointmentForDetail(appt);
              setAppointmentDetailOpen(true);
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{formatDateLong(parseISO(appt.appointmentDate))}</span>
                <span className="text-muted-foreground">{appt.startTime} - {appt.endTime}</span>
                {appt.isVideoAppointment && <Video className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                {appt.provider && <span>{appt.provider.firstName} {appt.provider.lastName}</span>}
                {appt.service?.name && <span>· {appt.service.name}</span>}
              </div>
              {appt.notes && (
                <div className="text-xs text-muted-foreground truncate mt-0.5">{appt.notes}</div>
              )}
            </div>
            <Badge className={`${STATUS_COLORS[appt.status]?.bg} ${STATUS_COLORS[appt.status]?.text} shrink-0`}>
              {getStatusLabel(appt.status)}
            </Badge>
          </div>
        ))}
    </div>
  )}

  <AppointmentDetailDialog
    open={appointmentDetailOpen}
    onOpenChange={setAppointmentDetailOpen}
    appointment={selectedAppointmentForDetail}
    hospitalId={hospitalId}
    unitId={activeHospital?.unitId}
    providers={providers}
  />

  <BookingDialog
    open={newAppointmentOpen}
    onOpenChange={setNewAppointmentOpen}
    hospitalId={hospitalId}
    unitId={activeHospital?.unitId}
    providers={providers}
    defaults={{ patientId: id }}
  />
</TabsContent>
```

Note: `BookingDialog` needs a small update to accept an optional `patientId` in defaults to pre-fill the patient. Also import `AppointmentDetailDialog` and `BookingDialog`.

**Step 4: Add state variables**

```typescript
const [appointmentDetailOpen, setAppointmentDetailOpen] = useState(false);
const [selectedAppointmentForDetail, setSelectedAppointmentForDetail] = useState<AppointmentWithDetails | null>(null);
const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
```

**Step 5: Import STATUS_COLORS and helpers**

Import `STATUS_COLORS` and `getStatusLabel` — these may need to be extracted to a shared file or duplicated. Also import `AppointmentDetailDialog`, `BookingDialog`, `Video`, `Plus`, `formatDateLong`, `parseISO`.

**Step 6: Fetch providers for the dialogs**

Add a providers query (can reuse the same bookable-providers endpoint):

```typescript
const { data: providers = [] } = useQuery({
  queryKey: ['bookable-providers', hospitalId, activeHospital?.unitId],
  queryFn: async () => {
    const response = await fetch(
      `/api/clinic/${hospitalId}/bookable-providers?unitId=${activeHospital?.unitId}`,
      { credentials: 'include' }
    );
    if (!response.ok) throw new Error('Failed');
    const data = await response.json();
    return data.map((p: any) => ({ id: p.userId, firstName: p.user?.firstName || null, lastName: p.user?.lastName || null }));
  },
  enabled: !!hospitalId && !!activeHospital?.unitId,
});
```

**Step 7: Update BookingDialog to accept pre-filled patient**

In `BookingDialog` props, extend `defaults` to include `patientId?: string`. If present, pre-select the patient and skip the search step.

**Step 8: Verify**

```bash
npm run check
```

**Step 9: Commit**

```bash
git add client/src/pages/anesthesia/PatientDetail.tsx client/src/pages/clinic/Appointments.tsx
git commit -m "feat: add Appointments tab to patient detail with full CRUD"
```

---

## Task 11: Final verification and cleanup

**Step 1: Run TypeScript check**

```bash
npm run check
```

**Step 2: Run dev server and manual test**

```bash
npm run dev
```

Verify:
- [ ] Video toggle appears in booking dialog
- [ ] Video icon shows on calendar day view cards
- [ ] Video icon shows on week view cards
- [ ] Notes preview shows on day view cards (only when space allows)
- [ ] Notes preview shows on week view cards
- [ ] Hover time indicator works on day view
- [ ] Patient detail has Appointments tab
- [ ] Appointments tab lists patient appointments sorted by date desc
- [ ] Can create new appointment from patient detail
- [ ] Can view/edit/cancel/delete appointment from patient detail
- [ ] Video badge and link show in appointment detail dialog

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address final UI polish for appointment improvements"
```
