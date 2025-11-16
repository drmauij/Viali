# Timeline Architecture Design

## Overview

This document defines the architecture for the anesthesia timeline system, which manages real-time recording of vital signs, medications, and events during surgical procedures.

## Module Structure

### 1. TimelineContainer
**Responsibility**: Orchestrates the timeline modules and manages shared state  
**Location**: `client/src/components/anesthesia/UnifiedTimeline.tsx`

- Manages timeline window (start/end times, zoom state)
- Coordinates shared time cursor and current time marker
- Handles swimlane configuration and layout
- Provides zoom/pan synchronization across all modules
- Renders the composite timeline view (vitals + medications + events)

### 2. VitalsTrack
**Responsibility**: Interactive vital signs monitoring and recording  
**Implementation**: Integrated within `UnifiedTimeline` component

- Renders vital sign charts (HR, BP, SpO2, temperature)
- Handles interactive data entry via click/touch tools
- Manages ventilation parameters (EtCO2, PIP, PEEP, tidal volume, RR, FiO2)
- Manages output parameters (gastric tube, drainage, vomit, urine, blood)
- Provides edit mode for correcting existing data points
- Auto-saves changes to backend via persistence service

### 3. MedicationTrack
**Responsibility**: Medication administration tracking  
**Implementation**: Integrated within `UnifiedTimeline` component

- Displays bolus medications as time-stamped pills
- Renders infusion sessions with rate segments
- Handles free-flow vs. rate-controlled infusion differentiation
- Manages medication dose entry and editing
- Groups medications by administration groups
- Persists medication records via persistence service

### 4. EventsTrack
**Responsibility**: Surgical event markers and annotations  
**Implementation**: Integrated within `UnifiedTimeline` component

- Renders event markers on timeline
- Supports anesthesia time codes (A1, X1, I, O1, O2, etc.)
- Handles event comments and descriptions
- Provides event editing and deletion
- Persists events via persistence service

## Shared Context

Currently, the timeline uses **local component state** rather than a dedicated context provider. State is managed within the `UnifiedTimeline` component.

### Proposed TimelineContext Interface

For future modularization, a shared context could be defined as:

```typescript
interface TimelineContext {
  // Core identifiers
  anesthesiaRecordId: string;
  
  // Time range management
  timeRange: {
    start: number;  // ms timestamp
    end: number;    // ms timestamp
  };
  
  // Zoom and view state
  zoomState: {
    currentStart: number | undefined;  // ms timestamp
    currentEnd: number | undefined;    // ms timestamp
  };
  
  // Current time tracking
  currentTime: number;  // ms timestamp - updates every minute
  chartInitTime: number;  // Fixed initialization time for editable boundaries
  
  // Snap intervals for time-based interactions
  vitalsSnapInterval: number;  // ms - zoom-dependent (1min, 5min, 10min)
  drugSnapInterval: number;    // ms - always 1 minute
  
  // Data state
  vitals: VitalsState;
  medications: MedicationState;
  events: EventState;
  
  // Update handlers
  onVitalsChange: (vitals: VitalsState) => void;
  onMedicationChange: (medications: MedicationState) => void;
  onEventChange: (events: EventState) => void;
}
```

**Note**: This context interface is aspirational. Current implementation uses local state within `UnifiedTimeline`.

## Data Flow

### 1. Data Loading (API → State)

```
Backend API
  ↓
React Query (useQuery)
  ↓
API Response Transformation
  ├─ apiVitalsToState()      → VitalsState
  ├─ apiMedicationsToState() → MedicationState
  └─ apiEventsToState()      → EventState
  ↓
Component Local State
  ├─ hrDataPoints
  ├─ bpDataPoints
  ├─ spo2DataPoints
  ├─ ventilationData
  ├─ outputData
  ├─ medicationDoseData
  └─ eventComments
  ↓
Timeline Rendering (ECharts)
```

**Key Files**:
- `client/src/services/timelineState.ts` - State transformation utilities
- `client/src/components/anesthesia/UnifiedTimeline.tsx` - State management

### 2. User Interactions (Module → State → Persistence)

```
User Interaction
  ↓
Event Handler (onClick, onTouch, onDrag)
  ↓
State Update (React setState)
  ├─ setHrDataPoints()
  ├─ setBpDataPoints()
  ├─ setMedicationDoseData()
  └─ setEventComments()
  ↓
Auto-save Debounce (500ms)
  ↓
Persistence Service
  ├─ saveVitals()
  ├─ saveMedication()
  └─ saveEvent()
  ↓
Backend API (POST)
  ↓
Query Invalidation
  ↓
UI Refresh
```

**Key Features**:
- Optimistic UI updates (state changes immediately)
- Debounced auto-save prevents excessive API calls
- Query invalidation ensures data consistency

## Persistence Contracts

All timeline modules use centralized persistence services from `client/src/services/timelinePersistence.ts`.

### saveVitals(payload: SaveVitalsPayload)

**Purpose**: Save or update vital signs snapshot at a specific timestamp

**Payload**:
```typescript
{
  anesthesiaRecordId: string;
  timestamp: Date;
  data: {
    hr?: number;
    sysBP?: number;
    diaBP?: number;
    spo2?: number;
    temp?: number;
    etco2?: number;
    pip?: number;
    peep?: number;
    tidalVolume?: number;
    respiratoryRate?: number;
    fio2?: number;
    gastricTube?: number;
    drainage?: number;
    vomit?: number;
    urine?: number;
    blood?: number;
    // ... other vitals
  };
}
```

**Backend Behavior**: 
- Uses `INSERT ON CONFLICT` for upsert logic
- Merges new data with existing snapshot at same timestamp
- Creates new snapshot if none exists

**Usage**: VitalsTrack module calls via React Query mutation

### saveMedication(payload: SaveMedicationPayload)

**Purpose**: Record medication administration (bolus or infusion)

**Payload**:
```typescript
{
  anesthesiaRecordId: string;
  itemId: string;  // Reference to inventory item
  timestamp: Date;
  type: 'bolus' | 'infusion_start' | 'infusion_stop' | 'rate_change';
  dose?: string;   // e.g., "5mg" or "50ml" (syringe quantity)
  unit?: string;   // e.g., "mg", "ml"
  route?: string;  // e.g., "IV", "PO"
  rate?: string;   // e.g., "100" (for ml/h or µg/kg/min)
  endTimestamp?: Date;  // For stopped infusions
}
```

**Backend Behavior**:
- Creates new medication record
- Supports infusion session reconstruction via type field

**Usage**: MedicationTrack module calls via React Query mutation

### saveEvent(payload: SaveEventPayload)

**Purpose**: Create timeline event marker with timestamp

**Payload**:
```typescript
{
  anesthesiaRecordId: string;
  timestamp: Date;
  eventType?: string;     // e.g., "A1", "X1", "O1" (anesthesia codes)
  description: string;    // Event text
}
```

**Backend Behavior**:
- Creates new event record
- Returns created event with ID

**Usage**: EventsTrack module calls via React Query mutation

## Module Interface

### VitalsTrack Props (Current Implementation)

Since VitalsTrack is integrated within UnifiedTimeline, it uses internal state and props:

```typescript
{
  data: UnifiedTimelineData;  // Contains vitals, medications, events
  height?: number;            // Timeline height in pixels
  now?: number;               // Current time (ms) for NOW line
  patientWeight?: number;     // For ventilation calculations
  anesthesiaRecordId?: string;  // For auto-saving
}
```

**Internal State**:
- `hrDataPoints`: VitalPoint[]
- `bpDataPoints`: { sys: VitalPoint[], dia: VitalPoint[] }
- `spo2DataPoints`: VitalPoint[]
- `ventilationData`: { etCO2, pip, peep, tidalVolume, respiratoryRate, fio2 }
- `outputData`: { gastricTube, drainage, vomit, urine, blood, ... }

**Callbacks**:
- Auto-saves via `saveVitalsMutation` on data changes

### MedicationTrack Props (Current Implementation)

Integrated within UnifiedTimeline:

```typescript
{
  anesthesiaItems: AnesthesiaItem[];  // Configured medications
  administrationGroups: AdministrationGroup[];  // Grouping metadata
  medications?: any[];  // Raw API medication records
}
```

**Internal State**:
- `medicationDoseData`: { [swimlaneId]: Array<[timestamp, dose]> }
- `rateInfusionSessions`: { [swimlaneId]: InfusionSession }
- `freeFlowSessions`: { [swimlaneId]: FreeFlowSession[] }

**Callbacks**:
- Saves via `saveMedicationMutation` on dose/infusion changes

### EventsTrack Props (Current Implementation)

Integrated within UnifiedTimeline:

```typescript
{
  apiEvents?: any[];  // Raw API event records
  anesthesiaTimeMarkers: AnesthesiaTimeMarker[];  // Predefined codes
}
```

**Internal State**:
- `eventComments`: EventComment[]
- `anesthesiaTimeMarkers`: Array with time placements

**Callbacks**:
- Saves via `saveEvent` mutation

### TimelineContainer Props

```typescript
{
  data: UnifiedTimelineData;
  height?: number;
  swimlanes?: SwimlaneConfig[];  // Optional custom swimlane config
  now?: number;
  patientWeight?: number;
  anesthesiaRecordId?: string;
}
```

## Design Principles

### 1. Optimistic Updates
- UI responds immediately to user input
- Backend sync happens asynchronously
- Errors trigger rollback and user notification

### 2. Debounced Persistence
- Auto-save debounce: 500ms
- Prevents duplicate saves for rapid interactions
- Tracks last saved state to avoid redundant API calls

### 3. Modular Swimlanes
- Swimlanes configured via `SwimlaneConfig[]`
- Easy to add/remove tracks at runtime
- Three-level hierarchy support: parent → group → item

### 4. Time-Based Interactions
- Snap intervals adapt to zoom level (vitals: 1min/5min/10min)
- Medications always snap to 1-minute intervals
- Editable zones: past (since chart init) and future (unlimited)

### 5. Data Normalization
- Consistent time format: Unix timestamp (ms)
- Type-safe data transformations via `timelineState.ts`
- API response converters ensure clean state

## Future Enhancements

### 1. Context Extraction
Extract shared state into `TimelineContext` provider for better separation of concerns:

```typescript
<TimelineProvider anesthesiaRecordId={recordId}>
  <VitalsTrack />
  <MedicationTrack />
  <EventsTrack />
</TimelineProvider>
```

### 2. Module Isolation
Split `UnifiedTimeline` into discrete modules:
- `VitalsTrack.tsx` - Self-contained vital signs module
- `MedicationTrack.tsx` - Self-contained medication module
- `EventsTrack.tsx` - Self-contained events module
- `TimelineContainer.tsx` - Orchestration layer

### 3. Real-Time Sync
Implement WebSocket support for multi-user collaboration:
- Broadcast state changes to other connected clients
- Conflict resolution for concurrent edits
- Live cursor positions for awareness

### 4. Offline Support
Add offline-first capabilities:
- IndexedDB for local persistence
- Sync queue for pending changes
- Optimistic sync with conflict detection

## File Organization

```
client/src/
├── components/anesthesia/
│   ├── UnifiedTimeline.tsx       # Main timeline container (current)
│   ├── AnesthesiaTimeline.tsx    # Legacy timeline (vis-timeline based)
│   └── StickyTimelineHeader.tsx  # Timeline header component
├── services/
│   ├── timelinePersistence.ts    # Persistence service layer
│   └── timelineState.ts          # State management utilities
└── contexts/
    └── TimelineContext.tsx       # (Future) Shared timeline context
```

## Summary

The timeline architecture follows a **monolithic component pattern** with integrated modules. State is managed locally within `UnifiedTimeline`, with centralized persistence services providing a clean API boundary. Future evolution toward modular, context-driven architecture is supported by well-defined interfaces and separation between state management (`timelineState.ts`) and persistence (`timelinePersistence.ts`).
