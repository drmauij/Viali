# Viali - Hospital Inventory Management System

## ⚠️ CRITICAL: Database Migration Rules for AI Agent

**NEVER create migration files manually.** Always follow this workflow:

1. Update `shared/schema.ts` with schema changes
2. Run `npm run db:generate` to create migration AND update Drizzle journal
3. Convert generated SQL to idempotent (IF NOT EXISTS patterns)
4. Run `npm run db:migrate` or restart server

Failing to use `db:generate` causes duplicate migrations when syncing the journal.

---

## Overview
Viali is a mobile-first web application designed to optimize hospital operations. Its core purpose is to provide a robust Inventory Management module to prevent stockouts, minimize waste, and automate reordering, including controlled substances, across multiple hospital facilities. It also features an Anesthesia Records module that streamlines patient case management with AI-assisted data extraction. The system aims to enhance healthcare efficiency and patient safety through consistent UI/UX, multi-hospital support, and granular user role management. Future plans include an Ambulatory Invoice Module to manage outpatient billing and integrate with existing patient and inventory data.

## User Preferences
Preferred communication style: Simple, everyday language.

Deployment Environment: The application is deployed to a custom server on **Exoscale** (Ubuntu-based VPS), NOT on Replit. Do not search Replit documentation for deployment-related issues. The user has sudo access and full control over the server environment.

**CRITICAL - No Replit-Specific Features:**
- NEVER use Replit Connectors for API integrations (e.g., Resend, OpenAI, etc.)
- NEVER use Replit-specific storage or object storage solutions
- ALWAYS use standard environment variables for API keys and configuration
- ALWAYS use standard libraries and SDKs directly (e.g., `RESEND_API_KEY` env var, not Replit connector)
- All integrations must work in a standard Node.js/Linux environment without Replit dependencies

## System Architecture

### Frontend
The frontend uses React, TypeScript, and Vite, with Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. Key features include an interactive OP Schedule with drag-and-drop, a full-screen OP Monitoring System with Apache ECharts for vitals visualization and AI-powered data extraction, integrated barcode scanning, and dynamic, role-based navigation across modules.

### Frontend Component Organization
Large components are modularized for maintainability:
- **client/src/components/anesthesia/unifiedTimeline/**: Extracted modules from UnifiedTimeline.tsx:
  - `types.ts` - Type definitions (VitalPoint, TimelineVitals, TimelineEvent, InfusionSession, SwimlaneConfig, etc.)
  - `constants.ts` - ANESTHESIA_TIME_MARKERS and time constants
  - `EditValueForm.tsx` - Vitals editing form component
  - `SortableMedicationItem.tsx` - Drag-and-drop medication item component
  - `index.ts` - Re-exports all modules
- **client/src/pages/items/**: Extracted modules from Items.tsx:
  - `types.ts` - Type definitions (FilterType, ItemWithStock, UnitType, ItemsProps)
  - `helpers.ts` - Helper functions (isTouchDevice, parseCurrencyValue, extractPackSizeFromName)
  - `DragDropComponents.tsx` - DnD components (DraggableItem, DropIndicator, DroppableFolder)
  - `index.ts` - Re-exports all modules

### Backend
The backend is built with Express.js and TypeScript, utilizing a PostgreSQL database managed by Drizzle ORM. Authentication supports Google OAuth and local email/password via Passport.js with session-based authentication. The API is RESTful, featuring centralized error handling, bcrypt for password hashing, and robust role-based access control. It follows a modular architecture with domain-specific route modules. Key backend services include AI-powered medical monitor OCR and patient data encryption.

### Backend Route Organization
Routes are organized into modular files by domain:
- **server/routes/anesthesia/**: 163 routes across 10 modular files:
  - `settings.ts` - Surgery rooms, medication groups, administration groups configuration
  - `patients.ts` - Patient CRUD and search
  - `surgeries.ts` - Surgery scheduling and management
  - `records.ts` - Anesthesia record lifecycle (create, update, lock, delete)
  - `preop.ts` - Pre-operative assessment forms
  - `vitals.ts` - Vital signs and monitoring data
  - `medications.ts` - Medication administration
  - `events.ts` - Timeline events (anesthesia start/end, intubation, etc.)
  - `staff.ts` - Staff assignments to cases
  - `inventory.ts` - Anesthesia-specific inventory management
  - `index.ts` - Consolidates and exports all route modules

### Authentication & Authorization
Viali implements a hybrid authentication strategy (Google OAuth and local email/password) combined with robust role-based and multi-hospital authorization. A comprehensive user management system handles user creation, password changes, and hospital assignments, enforcing data isolation between hospitals at the API layer.

### Multi-Hospital Data Isolation Security
The system implements strict data isolation between hospitals using a centralized access control infrastructure:

- **Resource Resolver (`getHospitalIdFromResource`)**: Centralized function that derives hospitalId from any resource ID (items, orders, lots, alerts, surgery rooms, medication groups, administration groups, units, user roles, etc.)
- **`requireResourceAccess` middleware**: Factory that extracts resource ID from route params, looks up hospitalId via resolver, and verifies user has access to that hospital
- **`requireResourceAdmin` middleware**: Variant that requires admin role for the resource's hospital
- **Route-level validation**: All routes that accept resource IDs verify the resource belongs to the user's authorized hospitals
- **Payload sanitization**: Update routes strip hospital-linked fields (itemId, hospitalId, unitId) from payloads to prevent cross-hospital reassignment

Key protected routes include:
- Item supplier codes: Verifies supplierId belongs to itemId, strips dangerous fields from updates
- Item lots: Verifies lotId belongs to itemId
- Admin unit management: Uses requireResourceAdmin to verify admin role for unit's hospital
- Admin user role management: Uses requireResourceAdmin to verify admin role for role's hospital
- Anesthesia configuration: Surgery rooms, medication groups, administration groups all use requireResourceAccess

### Database Schema
The database schema includes entities for Users, Hospitals, Items, StockLevels, Lots, Orders, Activities, and Alerts, using UUID primary keys, timestamp tracking, and JSONB fields with Zod validation. A significant design choice for the Anesthesia module is the redesign of vitals storage to a single row per record with arrays of points for improved performance and granular CRUD.

### Database Migration Workflow (CRITICAL)

**Standard Workflow: Generate + Convert to Idempotent**

For every database schema change, follow these steps:

1. **Update schema**: Modify `shared/schema.ts` with your changes
2. **Generate migration**: Run `npm run db:generate` to create SQL migration file
   - This keeps Drizzle's internal snapshot synchronized with the schema
3. **Convert to idempotent**: Edit the generated `.sql` file to wrap statements in idempotent blocks:
   ```sql
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'your_table' AND column_name = 'your_column') THEN
       ALTER TABLE your_table ADD COLUMN your_column varchar;
     END IF;
   END $$;
   ```
4. **Rename file** (optional): Rename to be descriptive, e.g., `0069_add_xyz.sql`
   - Update the `tag` in `migrations/meta/_journal.json` to match the new filename (without `.sql`)
5. **Apply migration**: Run `npm run db:migrate` or restart server (auto-applies on startup)

**Idempotent Pattern Examples:**
- Add column: `IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'x' AND column_name = 'y')`
- Add table: `IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'x')`
- Add constraint: `IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'x')`
- Drop NOT NULL: `IF EXISTS (SELECT 1 FROM information_schema.columns WHERE ... AND is_nullable = 'NO')`

**Auto-migration on startup**: The server automatically runs all idempotent migrations on startup. All migrations (including 0000-0011) have been converted to use IF NOT EXISTS patterns, making them safe to re-run. This ensures new columns/tables are created on both development and production databases safely.

### Unit Type Architecture
Units have a `type` field that is the single source of truth for determining module functionality:
- `'anesthesia'` - Anesthesia module units
- `'or'` - Operating Room / Surgery module units
- `'business'` - Business module units
- `'clinic'` - Clinic module units
- `'logistic'` - Logistics module units
- `null` or other values - Standard inventory units

**Frontend**: Uses `activeHospital.unitType` to determine module access (e.g., `unitType === 'anesthesia'`)
**Backend**: Storage layer (`getUserHospitals`) derives deprecated flags from `type` for backwards compatibility. When creating/updating units, the admin routes derive module flags from the `type` field.
**Note**: The deprecated boolean flags (`isAnesthesiaModule`, `isSurgeryModule`, etc.) are still present in the database schema for backwards compatibility but should not be used as the source of truth. Always use the `type` field.

### System Design Choices
Core design decisions include:
- **Controlled Substances Management**: Workflows for administration logging, verification, electronic signature, and PDF reports.
- **Order & Item Lifecycle Management**: End-to-end order creation, submission, PDF export, and transactional item management with image uploads and AI analysis.
- **User Management**: Secure user creation, role assignment, and password management.
- **Custom Sorting**: Drag-and-drop functionality for organizing items and folders.
- **Bulk Import with AI & Background Worker**: AI-powered bulk photo import using Vision AI, processed asynchronously.
- **Switchable Vision AI Provider**: Hospital-level selection between OpenAI GPT-4o-mini and Mistral Pixtral for vision analysis tasks (inventory item/code extraction, anesthesia monitor OCR). Configured in Admin > Hospital > Integrations tab. Falls back to OpenAI if MISTRAL_API_KEY is not configured.
- **Anesthesia Module**: Configurable inventory locations, role-based access, comprehensive timeline CRUD for all swimlanes (Times, Events, Medications, etc.) using React Query, BIS/TOF monitoring, automated inventory usage calculation, and comprehensive documentation with electronic signatures and server-side audit trails.
- **Hospital Seed Data System**: Automated and manual provisioning of new hospitals with default data.
- **Universal Value Editing System**: Consistent `EditableValue` component for click-to-edit functionality.
- **Anesthesia Record Enhancements**: Common event quick-add, OP calendar status indicators, full localization (English/German), comprehensive PDF export with visual charts, historical record viewport centering, record locking, and sticker documentation storage in Exoscale S3.
- **Raspberry Pi Camera Integration**: Automated vital signs capture using Raspberry Pi devices, uploading to Exoscale S3, with API endpoints and a React hook for image fetching and Vision AI OCR processing.
- **Clinic Appointment Booking System**: Manages provider bookability and availability (`provider_availability`, `provider_time_off`, `provider_absences`, `clinic_appointments`). Supports both shared hospital calendars (default for small clinics) and unit-specific calendars via `hasOwnCalendar` flag on units.
- **Shared Hospital Calendar Architecture**: By default, units share a hospital-wide calendar. Units can opt-in to their own calendar via the `hasOwnCalendar` boolean. Clinic tables (`clinic_providers`, `provider_availability`, `provider_time_off`, `provider_availability_windows`) support both scopes via nullable `unitId` (hospital-level when null with `hospitalId` set) or specific `unitId` (unit-specific).
- **Bidirectional Cal.com Sync for RetellAI Voice Booking**: Real-time synchronization between the clinic calendar and Cal.com for appointment booking. This includes outbound sync (clinic appointments to Cal.com busy blocks) and inbound sync (Cal.com webhooks for booking creation/updates/cancellations).
- **Patient Portal**: Public-facing mobile-first landing page for patients at `/patient/:token`. Shows surgery information (date, time, procedure, anesthesia type), fasting instructions, info flyer downloads, and questionnaire status with link to complete. Bilingual support (German default, English option). All outbound SMS/email links now point to the patient portal instead of directly to the questionnaire. Portal validates both `expiresAt` and `status` fields to prevent access to invalidated links.

## External Dependencies

**Database:**
- Neon Serverless PostgreSQL

**Authentication Services:**
- Google OAuth 2.0
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