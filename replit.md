# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application designed to optimize hospital operations. Its primary purpose is to provide a robust Inventory Management module to prevent stockouts, minimize waste, and automate the reordering process, including controlled substances, across multiple hospital facilities. Additionally, it features an Anesthesia Records module that streamlines patient case management with AI-assisted data extraction. The system aims to enhance healthcare efficiency and patient safety through consistent UI/UX, multi-hospital support, and granular user role management.

## User Preferences
Preferred communication style: Simple, everyday language.

**Deployment Environment**: The application is deployed to a custom server on **Exoscale** (Ubuntu-based VPS), NOT on Replit. Do not search Replit documentation for deployment-related issues. The user has sudo access and full control over the server environment.

## System Architecture

### Frontend
The frontend is built with React, TypeScript, and Vite, utilizing Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. It comprises modular Inventory, Anesthesia, and Administration sections with dynamic navigation and role-based visibility. Key features include an interactive OP Schedule with drag-and-drop functionality, a full-screen OP Monitoring System with Apache ECharts for vitals visualization and AI-powered data extraction, contextual medication configuration directly from vitals charts, and automated anesthesia record creation. It also supports integrated barcode scanning, signature pads, real-time item quick panels, and a hospital switcher.

### Backend
The backend is developed using Express.js and TypeScript, with a PostgreSQL database managed by Drizzle ORM. Authentication supports standard Google OAuth and local email/password via Passport.js, employing session-based authentication. The API is RESTful, featuring centralized error handling, bcrypt for password hashing, and role-based access control.

### Code Organization (Modular Architecture)
The backend follows a modular architecture for improved maintainability:
- **server/routes/**: Domain-specific route modules
  - `index.ts`: Router composer that registers all domain routers
  - `auth.ts`: Authentication routes (signup, login, password reset, user fetch) - ~300 lines
  - `inventory.ts`: Dashboard KPIs, folders CRUD, items CRUD, bulk operations - ~550 lines
  - `admin.ts`: Hospital settings, anesthesia/surgery config, surgeons, units, users CRUD - ~460 lines
  - `checklists.ts`: Checklist templates CRUD, pending checklists, completions, history - ~280 lines
  - `anesthesia.ts`: Complete anesthesia module (100 endpoints, ~4,300 lines) including patients, cases, surgeries, records, vitals, rhythm, TOF, ventilation, medications, events, positions, staff, inventory usage, audit, billing, PACU, pre-op assessments, surgery rooms, medication/administration groups
  - `middleware.ts`: Shared middleware for auth/access checks
  - Future modules: orders.ts
- **server/utils/**: Shared utility modules
  - `encryption.ts`: Patient data encryption (AES-256-CBC) with key derivation
  - `accessControl.ts`: User role verification, hospital access control, unit management
  - `licensing.ts`: License limits, usage throttling, bulk import limits
  - `index.ts`: Central re-export for all utilities
- **server/services/**: Business logic services
  - `aiMonitorAnalysis.ts`: AI-powered medical monitor OCR (vitals/ventilation extraction), voice transcription, drug command parsing
- **server/auth/**: Authentication modules
  - `google.ts`: Google OAuth strategy, session management, isAuthenticated middleware

### Routes Refactoring Pattern (Incremental Migration)
The monolithic `server/routes.ts` (originally 9,000+ lines) has been significantly refactored into domain-specific modules:
1. Create new router file in `server/routes/` (e.g., `inventory.ts`)
2. Extract relevant route handlers from `routes.ts` to the new file
3. Export as Express Router and register in `server/routes/index.ts`
4. Remove duplicate handlers from `routes.ts`
5. Test functionality before proceeding to next domain

Current status: Auth, inventory, admin, checklists, and anesthesia routes migrated (~6,000 lines total). ~2,500 lines remaining in routes.ts (~72% reduction achieved).

### Authentication & Authorization
Viali implements a hybrid authentication strategy (Google OAuth and local email/password) combined with robust role-based and multi-hospital authorization. A comprehensive user management system handles user creation, password changes, and hospital assignments. Data isolation between hospitals is enforced at the API layer through authorization, query parameter filtering, and resource-based authorization.

### Database Schema
The database schema includes entities for Users, Hospitals, UserHospitalRoles, Items (with barcode support, min/max thresholds, controlled flags), StockLevels, Lots, Orders, Activities (audit trails), and Alerts. It utilizes UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation. Schema changes are managed via Drizzle ORM, with an automated workflow for migration generation and execution on server startup.

### Database Migrations (CRITICAL - Always Review & Make Idempotent)
**IMPORTANT**: Drizzle generates non-idempotent migrations by default. Before deploying ANY migration (including Drizzle-generated ones), always review and convert to idempotent patterns to prevent deployment failures.

**Always check and fix new migrations in `migrations/` folder before pushing to production.**

#### Idempotent Migration Patterns (Use These):

```sql
-- For adding columns (Drizzle generates: ALTER TABLE "x" ADD COLUMN "y" type;)
-- Convert to:
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'table_name' AND column_name = 'column_name'
  ) THEN
    ALTER TABLE "table_name" ADD COLUMN "column_name" type;
  END IF;
END $$;

-- For creating tables:
CREATE TABLE IF NOT EXISTS "table_name" (...);

-- For adding constraints:
DO $$ BEGIN
  ALTER TABLE "table_name" ADD CONSTRAINT "constraint_name" ...;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- For creating indexes:
CREATE INDEX IF NOT EXISTS "index_name" ON "table_name" (...);

-- For renaming columns:
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'table_name' AND column_name = 'old_name'
  ) THEN
    ALTER TABLE "table_name" RENAME COLUMN "old_name" TO "new_name";
  END IF;
END $$;

-- For dropping tables/columns (be careful!):
DROP TABLE IF EXISTS "table_name" CASCADE;
ALTER TABLE "table_name" DROP COLUMN IF EXISTS "column_name";
```

#### Migration Checklist Before Deployment:
1. Run `npm run db:generate` to create new migrations
2. Open each new `.sql` file in `migrations/` folder
3. Convert all statements to idempotent patterns above
4. Ensure the migration is tracked in `migrations/meta/_journal.json`
5. Test migration locally before deploying to production

### System Design Choices
Core design decisions include:
- **Controlled Substances Management**: Workflows for administration logging, verification, electronic signature, and PDF reports.
- **Order Management**: End-to-end order creation, submission, and PDF export.
- **Item Lifecycle Management**: Creation, updating, and transactional deletion of items with image uploads and AI photo analysis.
- **User Management**: Secure user creation, role assignment, and password management.
- **Custom Sorting**: Drag-and-drop functionality for organizing items and folders.
- **Bulk Import with AI & Background Worker**: AI-powered bulk photo import using OpenAI Vision API, processed asynchronously.
- **Anesthesia Module Configuration & Access Control**: Hospitals configure specific inventory locations for the anesthesia module, with access restricted by user roles.
- **Hospital Seed Data System**: Automated and manual provisioning of new hospitals with essential default data.
- **Universal Value Editing System**: `EditableValue` component for consistent click-to-edit functionality.
- **Point-Based Vitals System**: Redesigned vitals storage to a single row per anesthesia record with arrays of points for granular CRUD operations and improved performance.
- **Anesthesia Timeline CRUD Redesign**: Systematic implementation of full CRUD for all timeline swimlanes (Times, Events, Heart Rhythm, Medications, Position, Staff, Ventilation Mode, Output) using React Query.
- **Complete Data Loading System**: UnifiedTimeline component for comprehensive data fetching and synchronization across all 8 swimlanes using React Query hooks and local state management.
- **BIS and TOF Monitoring**: Integrated monitoring for depth of anesthesia (BIS) and neuromuscular blockade (TOF) with dedicated CRUD operations.
- **Automated Inventory Usage Calculation**: Intelligent system for automatically calculating medication usage from timeline administration data with real-time synchronization. Calculation triggers on component mount and whenever medications are created/updated/deleted. Free-flow infusions count immediately upon start (startEvents.length), while rate-controlled infusions calculate usage based on rate and duration (requires both start and stop events). Manual overrides supported with full audit trails. Inventory Usage tab features auto-expanding accordion sections for folders containing used items, with controlled state that updates dynamically when usage data loads.
- **Anesthesia Documentation & Checklists**: Comprehensive case documentation system covering technique documentation and WHO Surgical Safety Checklist phases with electronic signatures and server-side audit trails.
- **Common Event Quick-Add System**: Streamlined event logging with one-click common event buttons (Team Timeout, Intubation, Extubation, Eye Protection, Warm Touch) that immediately save to timeline with icon-based visual differentiation. Events render with specific icons based on event type, with fallback to generic icon for custom text entries.
- **OP Calendar Timeline Status Indicators**: Color-coded surgery status visualization in OP calendar (red=surgical incision, yellow=surgical suture, green=anesthesia/surgery end) with conditional PACU button enablement based on anesthesia presence end marker.
- **Full English/German Localization (i18next)**: Comprehensive internationalization implementation covering the entire application with 600+ translation keys across 7 major pages (Patients, PreOpList, PACU, Reports, Settings, OP Monitoring [2,050 lines], PatientDetail [3,471 lines]). All user-facing strings, error messages, success notifications, form labels, placeholders, buttons, medical terminology, and anesthesia technique options are fully localized. Time formatting uses 24-hour European format throughout. Translation structure uses nested keys (anesthesia.{domain}.{section}.{label}) for maintainability and organization.
- **Comprehensive PDF Export with Visual Charts**: Complete anesthesia record PDF generation system featuring native jsPDF chart rendering for comprehensive surgical documentation suitable for clinic KIS system imports. Includes five visual timeline sections: (1) Vital Signs Timeline - multi-line time-series chart showing HR, BP (systolic/diastolic), SpO2, and Temperature with color-coded legends and grid lines; (2) Medications & Infusions Timeline - swimlane visualization displaying bolus administrations as vertical bars and infusions as horizontal bars with dose/rate labels, grouped by medication type; (3) Ventilation Parameters - timeline chart for PIP, PEEP, tidal volume, respiratory rate, FiO2, and EtCO2; (4) Fluid Balance & Output - horizontal bar chart showing totals for urine, drainage, gastric tube output, and blood; (5) Heart Rhythm - color-coded timeline segments showing rhythm changes (Sinus=green, AF=red, SVT=orange, VT=dark red). All charts handle edge cases gracefully (empty data, single data points) with automatic range expansion to prevent division-by-zero errors. Charts use 24-hour European time format and integrate seamlessly with existing text-based summary sections.
- **Historical Record Viewport Centering**: The timeline automatically detects historical records (data older than 1 hour) via the `isHistoricalData` flag from useTimelineData. For historical records, the timeline centers the viewport on the actual data range instead of extending to future. Uses a sentinel-based approach (null initial refs) to ensure proper zoom reset even when the historical flag arrives asynchronously. Prev refs are only updated after successful viewport centering, ensuring retries until success.
- **Record Locking System**: When PACU End (A2) marker is set, the anesthesia record is automatically locked. Uses hasValidTime helper for proper Date type normalization. Lock status UI refreshes immediately via consistent query key invalidation (`['/api/anesthesia/records/${id}']`).

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

## Planned Features (For Later Implementation)

### Exoscale Object Storage Integration
**Status**: Deferred (current base64 storage in PostgreSQL is sufficient for signatures + 1-2 photos per surgery)

**When to implement**: When adding patient document scanning, pre-surgery evaluation photos, or when database backup times slow down.

**Implementation tasks**:
1. Install AWS S3 SDK for Exoscale SOS compatibility (`@aws-sdk/client-s3`)
2. Create Exoscale storage service (`server/services/exoscaleStorage.ts`) with upload/download/delete methods
3. Add API routes for file operations (upload, retrieve, delete)
4. Update pre-surgery evaluation to use Exoscale storage for patient photos
5. Configure environment variables: `EXOSCALE_API_KEY`, `EXOSCALE_API_SECRET`, `EXOSCALE_BUCKET`, `EXOSCALE_ZONE`

**Why Exoscale over Replit storage**: Swiss data residency, lower latency (same infrastructure as deployment), healthcare compliance, cost control.