# VitalsTrack Component

A clean, focused component for displaying and editing vital signs in the anesthesia timeline.

## Features

- ✅ **Interactive Charts**: HR, BP (systolic/diastolic), SpO2 visualization using ECharts
- ✅ **Click-to-Add**: Click anywhere on the timeline to add new vital signs
- ✅ **Edit Points**: Click on any data point to edit value and timestamp
- ✅ **Delete Points**: Remove individual vital sign measurements
- ✅ **Persistence**: Automatic saving with proper error handling
- ✅ **Cache Invalidation**: React Query cache is invalidated after mutations
- ✅ **Test IDs**: All interactive elements have `data-testid` attributes

## Usage

```tsx
import { VitalsTrack } from '@/components/anesthesia/timeline/VitalsTrack';

function MyComponent() {
  const vitalsData = {
    hr: [[timestamp1, 75], [timestamp2, 82]],
    sysBP: [[timestamp1, 120], [timestamp2, 125]],
    diaBP: [[timestamp1, 80], [timestamp2, 82]],
    spo2: [[timestamp1, 98], [timestamp2, 99]],
  };

  return (
    <VitalsTrack
      anesthesiaRecordId="record-123"
      timeRange={{
        start: Date.now() - 3600000, // 1 hour ago
        end: Date.now() + 3600000,   // 1 hour from now
      }}
      vitalsData={vitalsData}
      onVitalsChange={(updatedData) => {
        console.log('Vitals changed:', updatedData);
      }}
      height={400}
    />
  );
}
```

## Props

### `anesthesiaRecordId` (string, required)
The ID of the anesthesia record to save vitals to.

### `timeRange` (object, required)
The time range to display on the chart.
- `start` (number): Start timestamp in milliseconds
- `end` (number): End timestamp in milliseconds

### `vitalsData` (VitalsData, required)
The current vitals data to display.
```typescript
{
  hr: VitalPoint[];       // Heart rate
  sysBP: VitalPoint[];    // Systolic blood pressure
  diaBP: VitalPoint[];    // Diastolic blood pressure
  spo2: VitalPoint[];     // Oxygen saturation
}

type VitalPoint = [number, number]; // [timestamp, value]
```

### `onVitalsChange` (function, optional)
Callback fired when vitals data changes (after successful save).
```typescript
(updatedData: VitalsData) => void
```

### `height` (number, optional)
Chart height in pixels. Default: `400`

## Data Flow

### Adding New Vitals
1. User clicks on the timeline (x-axis)
2. Dialog opens with timestamp pre-filled
3. User enters HR, BP, SpO2 values (optional - can enter one or multiple)
4. Click "Save" → calls `saveVitals()` from `timelinePersistence.ts`
5. Backend handles upsert (INSERT ON CONFLICT)
6. Cache invalidated → UI refreshes
7. `onVitalsChange` callback fired with updated data

### Editing Vitals
1. User clicks on a data point (heart icon, chevron, or circle dot)
2. Dialog opens with current value and timestamp
3. User modifies value and/or timestamp
4. Click "Save" → fetches snapshot by timestamp → PATCHes updated data
5. Cache invalidated → UI refreshes
6. `onVitalsChange` callback fired with updated data

### Deleting Vitals
1. User clicks on a data point
2. Dialog opens in edit mode
3. User clicks "Delete" button
4. Fetches snapshot by timestamp → PATCHes with field removed
5. Cache invalidated → UI refreshes
6. `onVitalsChange` callback fired with updated data

## Persistence Layer

The component uses `saveVitals` from `client/src/services/timelinePersistence.ts`:

```typescript
await saveVitals({
  anesthesiaRecordId: string,
  timestamp: Date,
  data: {
    hr?: number,
    sysBP?: number,
    diaBP?: number,
    spo2?: number,
  }
});
```

### Backend Behavior
- POST `/api/anesthesia/vitals` with INSERT ON CONFLICT (upsert)
- If snapshot exists at timestamp → merges new data
- If no snapshot → creates new one

### Edit/Delete Flow
1. GET `/api/anesthesia/records/{recordId}/vitals?timestamp={timestamp}` to fetch snapshot
2. PATCH `/api/anesthesia/vitals/{snapshotId}` with updated `data` field
3. DELETE is implemented as PATCH with field removed from data object

## Test IDs

All interactive elements have `data-testid` attributes for testing:

### Main Component
- `vitals-track`: Container div
- `vitals-chart`: ECharts component

### Add Dialog
- `dialog-add-vitals`: Dialog container
- `input-hr`: Heart rate input
- `input-spo2`: SpO2 input
- `input-sysbp`: Systolic BP input
- `input-diabp`: Diastolic BP input
- `button-save-add`: Save button
- `button-cancel-add`: Cancel button

### Edit Dialog
- `dialog-edit-vitals`: Dialog container
- `input-edit-value`: Value input
- `input-edit-time`: Timestamp input
- `button-save-edit`: Save button
- `button-cancel-edit`: Cancel button
- `button-delete-vital`: Delete button

## Error Handling

All mutations include proper error handling with toast notifications:

```typescript
onError: (error: any) => {
  toast({
    title: "Error saving vitals",
    description: error.message || "Failed to save vital signs.",
    variant: "destructive",
  });
}
```

## Theme Support

The component automatically detects light/dark theme and adjusts colors accordingly:
- HR: Red tones (#ef4444 dark, #dc2626 light)
- BP: Blue tones (#3b82f6 dark, #2563eb light)
- SpO2: Green tones (#10b981 dark, #059669 light)

## Chart Icons

Uses Lucide icon paths for data point markers:
- **HR**: Heart icon
- **Sys BP**: ChevronUp icon
- **Dia BP**: ChevronDown icon
- **SpO2**: CircleDot icon (double circle)

## Dependencies

- `echarts-for-react`: Chart rendering
- `@tanstack/react-query`: Data fetching and caching
- `@/components/ui/*`: shadcn/ui components (Dialog, Button, Input, etc.)
- `@/hooks/use-toast`: Toast notifications
- `@/services/timelinePersistence`: Backend persistence service
- `@/lib/vitalIconPaths`: Lucide icon SVG paths

## Limitations

- **Vitals Only**: This component only handles vital signs (HR, BP, SpO2). It does not handle medications or events.
- **Fixed Y-Axis Ranges**: HR (40-180), BP (40-220), SpO2 (85-100)
- **No Ventilation/Output**: Extended vitals (EtCO2, PIP, PEEP, etc.) are not included in this component
- **Single Record**: Only works with one anesthesia record at a time

## Future Enhancements

- [ ] Add ventilation parameters (EtCO2, PIP, PEEP, Tidal Volume, RR, FiO2)
- [ ] Add output parameters (Gastric Tube, Drainage, Vomit, Urine, Blood)
- [ ] Support batch editing (select multiple points)
- [ ] Add undo/redo functionality
- [ ] Support custom Y-axis ranges
- [ ] Add export to CSV/PDF functionality
- [ ] Support real-time updates via WebSockets
