# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application designed to optimize hospital operations through an Inventory Management module that prevents stockouts, minimizes waste, and automates reordering of controlled substances across multiple facilities. It also features an Anesthesia Records module that streamlines patient case management with AI-assisted data extraction. The system aims to enhance healthcare efficiency and patient safety with consistent UI/UX, multi-hospital support, and granular user role management. Future plans include an Ambulatory Invoice Module for outpatient billing, integrating with existing patient and inventory data, and integration with the Swiss TARDOC invoicing standard.

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
The frontend uses React, TypeScript, and Vite, with Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. Key features include an interactive OP Schedule with drag-and-drop, a full-screen OP Monitoring System with Apache ECharts for vitals visualization and AI-powered data extraction, integrated barcode scanning, and dynamic, role-based navigation. Large components are modularized for maintainability (e.g., `UnifiedTimeline`, `Items`).

### Backend
The backend is built with Express.js and TypeScript, utilizing a PostgreSQL database managed by Drizzle ORM. Authentication supports Google OAuth and local email/password via Passport.js with session-based authentication. The API is RESTful, featuring centralized error handling, bcrypt for password hashing, and robust role-based access control. It follows a modular architecture with domain-specific route modules (e.g., `server/routes/anesthesia/`). Key backend services include AI-powered medical monitor OCR and patient data encryption.

### Authentication & Authorization
Viali implements a hybrid authentication strategy (Google OAuth and local email/password) combined with robust role-based and multi-hospital authorization. A comprehensive user management system handles user creation, password changes, and hospital assignments, enforcing data isolation between hospitals at the API layer. Data isolation is achieved through a `requireResourceAccess` middleware that verifies user permissions for specific resources based on their associated hospital ID.

### Database Schema
The database schema includes entities for Users, Hospitals, Items, StockLevels, Lots, Orders, Activities, and Alerts, using UUID primary keys, timestamp tracking, and JSONB fields with Zod validation. A significant design choice for the Anesthesia module is the redesign of vitals storage to a single row per record with arrays of points for improved performance and granular CRUD. Database migrations follow a strict workflow: update `shared/schema.ts`, run `npm run db:generate`, convert generated SQL to idempotent using `IF NOT EXISTS` patterns, and then apply with `npm run db:migrate`.

### Unit Type Architecture
Units have a `type` field (`anesthesia`, `or`, `business`, `clinic`, `logistic`, or `null`) which is the single source of truth for determining module functionality and access control. The frontend uses `activeHospital.unitType` for module access, and the backend derives module flags from this field, deprecating older boolean flags.

### System Design Choices
Core design decisions include:
- **Controlled Substances Management**: Workflows for administration logging, verification, electronic signature, and PDF reports.
- **Order & Item Lifecycle Management**: End-to-end order creation, submission, PDF export, and transactional item management with image uploads and AI analysis.
- **User Management**: Secure user creation, role assignment, and password management.
- **Custom Sorting**: Drag-and-drop functionality for organizing items and folders.
- **Bulk Import with AI & Background Worker**: AI-powered bulk photo import using Vision AI, processed asynchronously.
- **Switchable Vision AI Provider**: Hospital-level selection between OpenAI GPT-4o-mini and Mistral Pixtral for vision analysis tasks.
- **Anesthesia Module**: Configurable inventory locations, role-based access, comprehensive timeline CRUD, BIS/TOF monitoring, automated inventory usage, and extensive documentation with e-signatures. Includes "Anesthesia Sets" for predefined technique/medication/inventory bundles.
- **Surgery Sets**: Predefined sets for surgery nursing documentation containing intraOpData snapshots (positioning, disinfection, equipment, irrigation, medications, dressing, drainage) and inventory items. Admin-only CRUD via `/api/surgery-sets` routes. Apply endpoint merges set data with existing intraOpData. Schema: `surgery_sets` (JSONB intraOpData) and `surgery_set_inventory` tables. UI: `SurgerySetsDialog` component accessible via Sets button in surgery mode on Op.tsx.
- **Hospital Seed Data System**: Automated and manual provisioning of new hospitals with default data.
- **Universal Value Editing System**: Consistent `EditableValue` component for click-to-edit functionality.
- **Anesthesia Record Enhancements**: Common event quick-add, OP calendar status indicators, full localization, comprehensive PDF export, record locking, and sticker documentation storage in Exoscale S3.
- **Surgeon Summary Email**: Simplified surgery summary PDF (patient info, surgery details, anesthesia times, staff list) that can be emailed to the surgeon directly from the SurgerySummaryDialog. Uses `client/src/lib/surgeonSummaryPdf.ts` for client-side PDF generation and `POST /api/anesthesia/surgeries/:id/send-summary` to send via Resend with PDF attachment. Surgeon email is pre-filled from hospital users if surgeonId is linked.
- **Raspberry Pi Camera Integration**: Automated vital signs capture using Raspberry Pi devices, uploading to Exoscale S3, with API endpoints and a React hook for image fetching and Vision AI OCR processing.
- **Clinic Appointment Booking System**: Manages provider bookability and availability, supporting shared hospital calendars or unit-specific calendars via a `hasOwnCalendar` flag.
- **Bidirectional Cal.com Sync for RetellAI Voice Booking**: Real-time synchronization between the clinic calendar and Cal.com for appointment booking.
- **Patient Portal**: Public-facing mobile-first landing page for patients showing surgery information, fasting instructions, info flyer downloads, and questionnaire status, with bilingual support. Includes remote informed consent signing with ID document upload, signature pad, and proxy signer support.
- **Remote Consent Signing**: When a pre-op assessment is saved as stand-by with "Patient signature missing", doctors can send an SMS/email invitation. Patients sign via the Patient Portal with ID verification, digital signature, and optional proxy signing. Schema fields: `consentSignedByProxy`, `consentProxySignerName/Relation`, `consentSignerIdFrontUrl/BackUrl`, `consentRemoteSignedAt`, `consentInvitationSentAt/Method`.
- **Suspend Surgery (Absetzen)**: Soft-cancel surgeries while keeping them visible on the OP plan with amber dashed borders and "ABGESETZT" badges. Suspended surgeries are excluded from SMS reminders, Cal.com calendar blocks, and PDF day plans. Fully reversible via reactivate button. Schema fields: `isSuspended`, `suspendedReason`, `suspendedAt`, `suspendedBy`.

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

**Security & Performance (Feb 2026):**
- Helmet middleware for HTTP security headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
- express-rate-limit: global API (300/min), auth routes (20/15min), AI routes (30/min)
- Zod validation on all API routes that accept request bodies in routes.ts
- React.lazy() + Suspense code-splitting for all 50+ page routes (massive bundle size reduction)
- All innerHTML usage replaced with safe DOM API calls

**Completed Optimizations (Feb 2026):**
- Split `server/storage.ts` from 9,820 lines into 12 domain-specific modules under `server/storage/`:
  - `users.ts` (14 methods), `hospitals.ts` (11), `inventory.ts` (50+), `orders.ts` (11)
  - `activities.ts` (12), `checklists.ts` (12), `importJobs.ts` (20), `chat.ts` (28)
  - `questionnaires.ts` (36), `clinic.ts` (74), `anesthesia.ts` (194 methods, largest domain)
  - `storage.ts` is now a thin 1,420-line file with IStorage interface + DatabaseStorage delegation class
  - Pattern: standalone exported async functions per module, DatabaseStorage delegates via property assignment

**Recommended Follow-Up Optimizations:**
- Migrate remaining routes from `server/routes.ts` (4.7K lines) into `server/routes/` modules
- Break down largest frontend components (UnifiedTimeline 10K, Items 7.5K, PatientDetail 7.5K lines)
- Replace `any` types across route handlers with proper Express Request/Response types
- Add a structured logger (e.g. pino) to replace 1,200+ console.log/warn/error calls