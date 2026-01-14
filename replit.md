# Viali - Hospital Inventory Management System

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

### Backend
The backend is built with Express.js and TypeScript, utilizing a PostgreSQL database managed by Drizzle ORM. Authentication supports Google OAuth and local email/password via Passport.js with session-based authentication. The API is RESTful, featuring centralized error handling, bcrypt for password hashing, and robust role-based access control. It follows a modular architecture with domain-specific route modules. Key backend services include AI-powered medical monitor OCR and patient data encryption.

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

**IMPORTANT: There are TWO ways to create migrations. Choose ONE, not both!**

#### Option A: Manual Idempotent Migrations (PREFERRED for production safety)
When creating migrations manually (recommended for production deployments):

1. **Update schema**: Modify `shared/schema.ts` with your changes
2. **Create manual migration file**: Create `migrations/XXXX_descriptive_name.sql` with idempotent SQL:
   ```sql
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'your_table' AND column_name = 'your_column') THEN
       ALTER TABLE your_table ADD COLUMN your_column varchar;
     END IF;
   END $$;
   ```
3. **Update journal**: Add entry to `migrations/meta/_journal.json` with next idx number
4. **Apply migration**: Run SQL directly or restart server (auto-applies on startup)

**DO NOT run `npm run db:generate` after creating manual migrations!** Drizzle will create a duplicate migration file.

#### Option B: Drizzle Auto-Generated Migrations
For quick development iterations only:

1. **Update schema**: Modify `shared/schema.ts` with your changes
2. **Generate migration**: Run `npm run db:generate` to create SQL migration file
3. **Apply migration**: Run `npm run db:migrate` or restart server

**WARNING**: Auto-generated migrations are NOT idempotent and may fail on re-run.

#### Avoiding Duplicate Migrations
- If you created a manual migration, NEVER run `npm run db:generate` - it will create duplicates
- If Drizzle creates a duplicate, delete both the `.sql` file and its entry in `_journal.json`
- Always check `migrations/` folder after running `db:generate` for unexpected files

**Important**: The auto-migration at server startup does NOT apply new migrations. It only marks them as applied if the schema already exists.

### System Design Choices
Core design decisions include:
- **Controlled Substances Management**: Workflows for administration logging, verification, electronic signature, and PDF reports.
- **Order & Item Lifecycle Management**: End-to-end order creation, submission, PDF export, and transactional item management with image uploads and AI analysis.
- **User Management**: Secure user creation, role assignment, and password management.
- **Custom Sorting**: Drag-and-drop functionality for organizing items and folders.
- **Bulk Import with AI & Background Worker**: AI-powered bulk photo import using OpenAI Vision API, processed asynchronously.
- **Anesthesia Module**: Configurable inventory locations, role-based access, comprehensive timeline CRUD for all swimlanes (Times, Events, Medications, etc.) using React Query, BIS/TOF monitoring, automated inventory usage calculation, and comprehensive documentation with electronic signatures and server-side audit trails.
- **Hospital Seed Data System**: Automated and manual provisioning of new hospitals with default data.
- **Universal Value Editing System**: Consistent `EditableValue` component for click-to-edit functionality.
- **Anesthesia Record Enhancements**: Common event quick-add, OP calendar status indicators, full localization (English/German), comprehensive PDF export with visual charts, historical record viewport centering, record locking, and sticker documentation storage in Exoscale S3.
- **Raspberry Pi Camera Integration**: Automated vital signs capture using Raspberry Pi devices, uploading to Exoscale S3, with API endpoints and a React hook for image fetching and Vision AI OCR processing.
- **Clinic Appointment Booking System**: Manages provider bookability and availability (`provider_availability`, `provider_time_off`, `provider_absences`, `clinic_appointments`).
- **Bidirectional Cal.com Sync for RetellAI Voice Booking**: Real-time synchronization between the clinic calendar and Cal.com for appointment booking. This includes outbound sync (clinic appointments to Cal.com busy blocks) and inbound sync (Cal.com webhooks for booking creation/updates/cancellations).

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