# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application for hospital operations, featuring an Inventory Management module to prevent stockouts, minimize waste, and automate reordering, including controlled substances across multiple hospitals. Its Anesthesia Records module streamlines patient case management with AI-assisted data extraction. The system prioritizes consistent UI/UX, multi-hospital support, and granular user roles to enhance healthcare efficiency and patient safety.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React, TypeScript, and Vite, with Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. It includes modular Inventory, Anesthesia, and Administration sections with dynamic navigation and role-based visibility.

Key Anesthesia Module features include:
- **OP Schedule**: An interactive calendar with Day/Week/Month/Agenda views for surgery rooms, supporting drag-and-drop rescheduling, quick surgery creation, and cancellation. It uses a European date/time format and has full dark theme support, responsive controls for mobile, and seamless page-level scrolling. The Week View is a custom `react-calendar-timeline` implementation with local state tracking for consistency during rapid changes.
- **OP Monitoring System**: A full-screen interface featuring Apache ECharts for vitals timeline visualization, real-time data entry, and AI-powered multi-monitor camera capture for data extraction via local OCR and OpenAI Vision API, with continuous infusion visualization.
- **Contextual Medication Configuration**: Administration groups in the anesthesia record timeline are clickable, allowing clinicians to configure medications directly from the vitals chart. Clicking a group opens a dialog where users can select inventory items, configure medication settings (dose, route, rate unit, ampule content), and immediately add them to the clicked group. This provides better context compared to configuring medications in a separate settings page.
- **Pre-Op Overview Tab**: A compact, read-only summary of pre-operative assessment data within the OP dialog for quick reference.
- **Auto-Creation of Anesthesia Records**: Automatically creates an anesthesia record when opening the OP dialog for a surgery that lacks one, with StrictMode-safe logic to prevent duplicates.
- Integrated barcode scanning, signature pads, real-time item quick panels, and a hospital switcher.

### Backend
The backend uses Express.js and TypeScript with a PostgreSQL database managed by Drizzle ORM. Authentication supports standard Google OAuth and local email/password via Passport.js, employing session-based authentication. The API is RESTful with centralized error handling, bcrypt for password hashing, and role-based access control.

### Authentication & Authorization
Viali uses a hybrid authentication strategy (Google OAuth and local email/password) with robust role-based and multi-hospital authorization. A user management system handles creation, password changes, and hospital assignments, secured with bcrypt. Data isolation between hospitals is enforced through API layer authorization, query parameter filtering, and resource-based authorization, with hospital-specific cache invalidation on the frontend.

### Database Schema
The database includes entities for Users, Hospitals, UserHospitalRoles, Items (with barcode support, min/max thresholds, controlled flags), StockLevels, Lots, Orders, Activities (audit trails), and Alerts. It uses UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation.

### System Design Choices
- **Controlled Substances Management**: Workflows for administration logging, verification, electronic signature, and PDF reports.
- **Order Management**: End-to-end order creation, submission, and PDF export.
- **Item Lifecycle Management**: Creation, updating, and transactional deletion of items with image uploads and AI photo analysis.
- **User Management**: Secure user creation, role assignment, and password management.
- **Custom Sorting**: Drag-and-drop functionality for organizing items and folders with persistent `sortOrder`.
- **Bulk Import with AI & Background Worker**: AI-powered bulk photo import using OpenAI Vision API, processed via an asynchronous job queue.
- **Anesthesia Module Configuration & Access Control**: Hospitals configure a specific inventory location for the anesthesia module, with access restricted to users assigned to that location.
- **Hospital Seed Data System**: Automatic and manual provisioning of new hospitals with essential default data, ensuring an idempotent and additive seeding process.
- **Universal Value Editing System**: `EditableValue` component for consistent click-to-edit functionality across various data types.
- **Point-Based Vitals System (Nov 2025)**: Complete redesign of vitals storage from multiple snapshot rows to a single row per anesthesia record with arrays of points. Each point has a unique UUID, timestamp, and value, enabling proper CRUD operations. The system uses React Query for optimistic updates and data synchronization, with a conversion layer maintaining backward compatibility with the existing ECharts-based UI. This eliminates the O(n²) snapshot aggregation that was blocking UI for 700-900ms and provides granular point-level edit/delete capabilities.
- **Anesthesia Timeline CRUD Redesign (Nov 2025)**: Systematic implementation of full CRUD operations for all timeline swimlanes using React Query as single source of truth. Completed swimlanes: Times (13 predefined markers stored in JSONB), Events (text annotations in separate table), Heart Rhythm (string-based rhythm values in JSONB points), Medications (infusions/boluses in separate table with full CRUD), Position (patient positioning in separate table), Staff (personnel assignments with role enum in separate table), Ventilation Mode (mode values in JSONB points with O(1) getClinicalSnapshot lookups), and Output (7 fluid output parameters - gastricTube, drainage, vomit, urine, urine677, blood, bloodIrrigation - as JSONB points with paramKey-based routing). Each swimlane has dedicated mutation hooks with proper cache invalidation, Zod validation with whitelisted fields in PATCH endpoints (using z.coerce.date() for timestamp handling and conditional updates object to prevent undefined overwrites), and security controls to prevent unauthorized data migration across records. Storage methods include guards against falsy paramKey to prevent undefined from accessing snapshot.data[undefined]. Ventilation parameters (etco2, pip, peep, tidalVolume, respiratoryRate, minuteVolume, fio2) already have CRUD through the existing vitals system.
- **Complete Data Loading System (Nov 2025)**: UnifiedTimeline component now implements comprehensive data fetching and synchronization for all 8 swimlanes. React Query hooks fetch positions, staff, and events from separate tables; useEffect hooks sync all JSONB data (heart rhythm, ventilation modes, ventilation parameters, output) from clinical snapshot and separate table data (positions, staff, events) into local state. Implementation handles three query states correctly: undefined (loading - skip sync), null (no data - clear state), and populated (sync data). All timestamp conversions use `new Date(...).getTime()` for proper epoch milliseconds. State clearing prevents stale data when switching between records with different data availability.
- **BIS and TOF Monitoring (Nov 2025)**: Added comprehensive monitoring capabilities for depth of anesthesia (BIS - Bispectral Index) and neuromuscular blockade (TOF - Train of Four). The "Others" collapsible parent swimlane contains BIS (numeric values 0-100) and TOF (fraction selection 0/4-4/4 with optional percentage) child swimlanes. Both monitoring parameters are stored as JSONB point arrays in clinicalSnapshots.data following the established vitals pattern. BIS reuses the existing vital point infrastructure with 'bis' added to the vitalType enum, while TOF has a custom structure (TOFPointWithId) with string values and optional percentage field. Full CRUD operations are implemented via dedicated React Query hooks (useAddTOFPoint, useUpdateTOFPoint, useDeleteTOFPoint) with optimistic updates and cache invalidation. Data flows through the standard pipeline: DB → React Query → useEventState → TimelineContext → Swimlane Components, with dedicated BISDialog and TOFDialog components providing user-friendly data entry with edit/delete functionality and interactive hover tooltips.
- **Medication Persistence Fix (Nov 2025)**: Resolved medication data synchronization bug where medications saved successfully to the database but disappeared when dialog reopened. Root cause was `lastSyncedMedicationRecordRef` preventing re-sync when the same record was accessed after mutations. The fix removed the ref and modified the medication sync useEffect to always sync from React Query data (matching the vitals pattern). Now medications flow correctly: DB → React Query → Local State → UI, ensuring free-flow infusions, rate infusions, and boluses persist across dialog reopens and cache invalidations.
- **Simplified Rate Infusion Management (Nov 2025)**: Streamlined rate-controlled infusion management UI by replacing the complex RateSheet dialog with a simplified RateManageDialog for running infusions. The new dialog matches the free-flow infusion pattern with a focused interface showing only rate adjustment, Stop, Start New, and Cancel buttons. Click handlers in MedicationsSwimlane now properly detect running vs stopped sessions and route to appropriate dialogs. All RateManageDialog invocations include proper rate unit fallback chain (session.segments[0]?.rateUnit || lane.rateUnit || 'ml/h'), display rate units in labels, use actual click time for forward-looking management (instead of session start time), and parse rate options from defaultDose when available. This provides a consistent, simpler user experience for managing active infusions across both the timeline line visualization and interactive layer clicks.
- **Anesthesia Documentation & Checklists (Nov 2025)**: Complete case documentation system with two main tabs in the OP dialog. The Anesthesia Documentation tab covers technique documentation (installations, airway management, general anesthesia, neuraxial blocks, peripheral blocks) through 4 specialized database tables with full CRUD operations, explicitly excluding drug/dose information tracked separately in the timeline. The Checklists tab implements the WHO Surgical Safety Checklist with three phases (Sign In before induction, Time Out before incision, Sign Out before patient leaves OR) stored as JSONB columns (signInData, timeOutData, signOutData) in the anesthesiaRecords table. Each phase includes checklist items (configured per hospital in anesthesiaSettings.checklistItems), notes, electronic signatures, and server-side audit trail stamping (completedAt, completedBy) to prevent client spoofing. React Query mutations provide persistent storage with proper cache invalidation, and Save buttons are disabled until anesthesiaRecord exists to ensure data integrity.
- **Automated Inventory Usage Calculation (Nov 2025)**: Intelligent inventory consumption tracking system that automatically calculates medication usage from timeline administration data. The system employs administration-type-specific calculation logic: Bolus (ceil(dose / ampule content) + 1 safety margin), Free-flow infusions (uses dose amount directly as it's already in ampules), and Rate-controlled infusions (ceil(rate × duration / ampule content)). Each inventory usage record tracks both calculatedQty (auto-computed) and overrideQty (manual adjustment) with full audit trail (overrideReason, overriddenBy, overriddenAt). The Inventory tab in the OP dialog displays all tracked items with calculated vs override columns, allowing clinicians to manually adjust quantities when needed (e.g., medication wastage, broken ampules). API endpoints support full lifecycle: POST /api/anesthesia/inventory/:recordId/manual for manual usage creation (calculatedQty=0, user-specified overrideQty), PATCH /api/anesthesia/inventory/:id/override for updating overrides, and DELETE /api/anesthesia/inventory/:id/override for clearing overrides. Storage uses upsert pattern with unique constraint on (anesthesiaRecordId, itemId) to prevent duplicates. All items remain visible regardless of quantity to ensure overrides set to zero can be reverted.

## External Dependencies

**Database:**
- Neon Serverless PostgreSQL

**Authentication Services:**
- Google OAuth 2.0 (via passport-google-oauth20)
- Passport.js
- connect-pg-simple

**UI Component Libraries:**
- Radix UI
- Shadcn/ui
- Lucide React & Font Awesome

**Data Visualization:**
- Apache ECharts
- echarts-for-react
- DayPilot Lite

**Development Tools:**
- Vite
- Drizzle Kit
- Zod

**Utilities:**
- bcrypt
- date-fns
- nanoid
- memoizee
- jsPDF & jspdf-autotable

**Email Service:**
- Resend

**AI Services:**
- OpenAI Vision API
- OpenAI GPT-4