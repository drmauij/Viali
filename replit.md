# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application designed to optimize hospital operations. It features an Inventory Management module that prevents stockouts, minimizes waste, automates reordering, and ensures compliance for controlled substances across multiple hospitals. The Anesthesia Records module streamlines patient case management from pre-operative to post-operative care, integrating AI-assisted data extraction. The system emphasizes a consistent UI/UX, multi-hospital support, and granular user roles to enhance healthcare efficiency and patient safety.

## User Preferences
Preferred communication style: Simple, everyday language.

## Production Deployment

### Database Migration Workflow

**Important**: The application uses a migration-based deployment strategy that ensures database schema changes are tracked and applied consistently across development and production environments.

#### How Migrations Work

**Development (Replit):**
- Schema changes are made in `shared/schema.ts`
- Run `npm run db:migrate` to generate migration files AND apply to dev database
- The dev server gracefully handles migrations already applied via db:push
- Migration files are committed to Git and deployed to production

**Production (Exoscale):**
- On app startup, migrations run automatically from the `migrations/` folder
- New deployments with schema changes are applied seamlessly
- No manual database commands needed on Exoscale

#### Making Schema Changes - Step by Step

**Automated Workflow (Recommended):**
1. **One-Time Setup**: Run `./scripts/install-git-hooks.sh` to install the automated migration generator
2. **Update Schema**: Edit `shared/schema.ts` with your changes
3. **Commit**: When you commit the schema changes, migration files are automatically generated and added to your commit
4. **Deploy**: Push to Git and deploy to Exoscale - migrations run automatically on production startup

**Manual Workflow:**
1. **Update Schema**: Edit `shared/schema.ts` with your changes
2. **Generate & Apply Migration**: Run `npm run db:migrate`
   - This generates a new migration file in `migrations/`
   - Applies the changes to your development database
3. **Verify**: Check the migration file in `migrations/` to ensure it's safe
4. **Commit & Deploy**: Push to Git and deploy to Exoscale
   - The migration runs automatically on production startup

#### Git Hook Automation

A pre-commit hook is available that automatically generates migration files whenever `shared/schema.ts` changes. This prevents the common mistake of forgetting to create migration files, which causes production deployments to fail.

**Installation:**
```bash
./scripts/install-git-hooks.sh
```

**What it does:**
- Detects when you commit changes to `shared/schema.ts`
- Automatically runs `npm run db:generate`
- Adds the generated migration file to your commit
- Shows you exactly what migration was created

**Files:**
- `scripts/pre-commit-hook.sh` - The git hook script
- `scripts/install-git-hooks.sh` - One-time installation script

#### Available Scripts

- `npm run db:generate` - Generate migration file from schema changes
- `npm run db:push` - Apply schema directly to dev database (fast iteration)
- `npm run db:migrate` - Generate migration AND apply to dev (recommended workflow)

#### Migration Safety

**Safe Changes (Additive):**
- Adding new columns with nullable or default values
- Creating new tables
- Adding indexes
- Adding foreign keys

**Potentially Unsafe Changes:**
- Removing columns (data loss)
- Changing column types (compatibility issues)
- Renaming tables/columns (breaks existing queries)
- Removing tables (data loss)

Always review generated migration files before deploying to production!

### Exoscale Deployment Instructions

**Initial Setup**: When deploying to a fresh Exoscale instance:
1. Configure DATABASE_URL environment variable
2. Deploy the application
3. Migrations run automatically on first startup
4. All 34 tables are created from migration files

**Updating Production**: When deploying schema changes:
1. Ensure migrations are generated and committed to Git
2. Deploy updated code to Exoscale
3. On restart, new migrations run automatically
4. Verify deployment success via logs

#### Technical Details
- Migration files: `migrations/*.sql`
- Tables: 34 (including hospitals, units, patients, surgeries, anesthesia_records, activities, notes, etc.)
- Migration runner: Drizzle ORM (runs on app startup)
- Tracking table: `__drizzle_migrations` (auto-created)

## System Architecture

### Frontend
The frontend is built with React, TypeScript, and Vite, utilizing Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. It comprises modular Inventory, Anesthesia, and Administration sections with dynamic navigation and role-based visibility.

**Key Anesthesia Module Features:**
- **OP Schedule:** Interactive calendar view with Day/Week/Month/Agenda modes displaying surgery rooms as resource columns with time-based scheduling. Uses European date/time format (DD/MM/YYYY, 24-hour time) via British English locale with full dark theme support. Supports drag-and-drop rescheduling, event resize for duration adjustment, quick surgery creation via time range selection with patient search/creation, and surgery cancellation/reactivation with visual indicators. Custom event components include Pre-OP and OP action buttons for quick access. Features responsive controls that adapt to mobile screens with icon-only buttons, seamless page-level scrolling (no internal scrollbar), borderless design, and header backgrounds that perfectly match the app theme in both light and dark modes.
  - **Day/Month/Agenda Views:** Uses react-big-calendar with custom styling for dark theme and European formatting
  - **Week View:** Custom implementation using react-calendar-timeline with horizontal timeline layout showing days (DD.MM.YY format, Monday start) on x-axis and surgery rooms on y-axis. Includes local state tracking via `currentStateRef` to eliminate race conditions during rapid drag/resize operations, ensuring room assignments and timestamps remain consistent before React Query refetch completes.
- **OP Monitoring System:** Full-screen interface with Apache ECharts for vitals timeline visualization, real-time data entry, adaptive tick granularity, and a three-zone editing system. It includes AI-powered multi-monitor camera capture for data extraction via local OCR and OpenAI Vision API, with continuous infusion visualization.
- **Pre-Op Overview Tab:** Compact, read-only summary of pre-operative assessment data displayed in the OP dialog, providing quick reference during surgery and handover. Shows only filled fields organized into logical sections (Allergies & CAVE, ASA & Vitals, Medications, Medical History, Airway, Fasting, Planned Anesthesia, Installations, Surgical Approval).
- **Auto-Creation of Anesthesia Records:** When opening the OP dialog for a surgery without an anesthesia record, the system automatically creates one. The creation logic is StrictMode-safe, setting a ref guard before the fetch to prevent duplicate creation attempts during React 18's double-mount behavior.
- Barcode scanning, signature pads, real-time item quick panels, and a hospital switcher are integrated throughout.

### Backend
The backend uses Express.js and TypeScript with a PostgreSQL database managed by Drizzle ORM. Authentication supports standard Google OAuth and local email/password via passport-google-oauth20, employing session-based authentication. The API is RESTful, featuring centralized error handling, bcrypt for password hashing, and role-based access control.

### Authentication & Authorization
Viali employs a hybrid authentication strategy (Google OAuth and local email/password) with robust role-based and multi-hospital authorization. A comprehensive user management system handles creation, password changes, and hospital assignments, secured with bcrypt.

#### Multi-Hospital Data Isolation

**Security Audit (November 2025):**

The system enforces strict data isolation between hospitals through a multi-layered authorization approach:

1. **API Layer Authorization (Primary Defense)**:
   - Every API endpoint that accesses hospital-specific data verifies user access before returning data
   - Pattern: `storage.getUserHospitals(userId)` → verify `hospitalId` exists in user's hospitals → return 403 if denied
   - Applied to ALL data access endpoints: patients, surgeries, anesthesia records, inventory items, preop assessments, vitals, medications, events

2. **Query Parameter Filtering**:
   - List endpoints require `hospitalId` as a query parameter
   - Backend validates user has access to that hospital before executing queries
   - Examples: `/api/patients?hospitalId=...`, `/api/anesthesia/surgeries?hospitalId=...`

3. **Resource-Based Authorization**:
   - When accessing by resource ID (e.g., `/api/patients/:id`), backend:
     - Fetches the resource
     - Checks resource's `hospitalId` against user's authorized hospitals
     - Returns 403 if user doesn't have access to that hospital

4. **Cache Invalidation**:
   - Frontend cache invalidation is hospital-specific using predicate functions
   - Prevents unnecessary cross-hospital cache refreshes
   - Maintains data isolation in the client-side cache

**Security Issue Fixed:**
- `/api/admin/users/search` endpoint previously allowed cross-hospital user enumeration
- Now requires `hospitalId` parameter and verifies:
  1. Admin has access to the specified hospital
  2. Found user actually belongs to that hospital
  3. Returns identical "User not found" message for both non-existent users and users in other hospitals (prevents information leakage)

**Architectural Recommendations for Future:**
- Consider adding hospital filtering at the storage/database layer as an additional defense layer
- Current pattern relies on API routes correctly implementing authorization checks
- Adding database-level filtering would provide defense-in-depth if a developer forgets to add authorization to a new endpoint

### Database Schema
The database schema includes entities for `Users`, `Hospitals`, `UserHospitalRoles`, `Items` (with barcode support, min/max thresholds, controlled flags, and anesthesia configuration), `StockLevels`, `Lots`, `Orders`, `Activities` (audit trails), and `Alerts`. It uses UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation. The anesthesia configuration was simplified to use `rateUnit` for defining medication administration types.

### System Design Choices
The system provides comprehensive inventory and anesthesia management:
- **Controlled Substances Management**: Workflows for administration logging, routine verification, electronic signature capture, and PDF reports.
- **Order Management**: End-to-end order creation, submission, and PDF export.
- **Item Lifecycle Management**: Creation, updating, and transactional deletion of items with image uploads, compression, and AI photo analysis.
- **User Management**: Secure user creation, role assignment, and password management.
- **Custom Sorting**: Drag-and-drop functionality for organizing items and folders with persistent `sortOrder`.
- **Bulk Import with AI & Background Worker**: AI-powered bulk photo import using OpenAI Vision API for automated item extraction, processed via an asynchronous job queue with a background worker for scalability and real-time progress tracking.
- **Anesthesia Module Configuration & Access Control**: Hospitals configure a specific inventory location for the anesthesia module, with access restricted to users assigned to that location.
- **Hospital Seed Data System**: Automatic and manual provisioning of new hospitals with essential default data, including locations, surgery rooms, administration groups, and pre-configured medications, ensuring an idempotent and additive seeding process.
- **Universal Value Editing System**: `EditableValue` component for consistent click-to-edit functionality across various data types, including time-based editing for vital signs.

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