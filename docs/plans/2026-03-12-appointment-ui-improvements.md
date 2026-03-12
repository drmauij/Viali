# Appointment UI Improvements Design

**Date:** 2026-03-12

## 1. Video Appointment Toggle

**Schema changes:**
- Add `isVideoAppointment` boolean (default false) to `clinicAppointments`
- Add `videoMeetingLink` text (nullable) to `clinicAppointments`

**UI changes:**
- Create/edit dialog: toggle switch for "Video appointment" + optional URL input for meeting link (shown when toggle is on)
- Calendar day view cards: video camera icon (e.g. Lucide `Video`) next to the time when `isVideoAppointment` is true
- Month view: no change (dots only)
- Appointment detail dialog: show video badge + clickable meeting link if present

**Update schema validation** to include both new fields in create and update endpoints.

## 2. Notes Preview on Day View Cards

**Current card layout (day view):**
- Line 1: `startTime` + patient name (bold)
- Line 2: service name (if present)

**New card layout:**
- Line 1: `startTime` + patient name (bold) + video icon if applicable
- Line 2: service name (if present)
- Line 3: notes preview (truncated, muted text)

Lines 2-3 only render if vertical space is sufficient (CSS overflow hidden). Notes take priority over service name if only one line of space is available — but show both if space allows.

## 3. Hover Time Indicator (Day View)

A horizontal dashed line that follows the mouse's vertical position on the calendar time grid, with a small label on the left showing the computed time (e.g. "10:35").

- Only active in day/week view (time-based grid)
- Line spans the full width of the time column being hovered
- Label styled as a small pill/badge on the left edge
- Uses `onMouseMove` on the calendar grid container to compute time from Y position
- Hidden when mouse leaves the grid

## 4. Patient Detail — Appointments Tab

**New tab** added to PatientDetail after existing tabs.

**Tab content:**
- "New Appointment" button at top — opens appointment creation dialog pre-filled with current patient
- Table/list sorted by date descending (most recent first)
- Columns: Date, Time, Provider, Video icon, Service, Status badge, Notes preview
- Row actions: Edit, Cancel, Delete
- Edit/Cancel/Delete reuse the existing appointment dialog from `Appointments.tsx`

**Data fetching:** Query appointments filtered by `patientId`, reuse existing API endpoint with patient filter.

**Component reuse:** Extract the appointment detail/edit dialog from `Appointments.tsx` into a shared component so both the calendar page and patient detail tab can use it.
