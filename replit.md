# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application for hospital operations, featuring Inventory Management and Anesthesia Records. The Inventory module optimizes anesthesia drug and general consumable management across multiple hospitals to prevent stockouts, minimize waste, automate reordering, and ensure compliance for controlled substances. The Anesthesia module streamlines patient case management from pre-operative to post-operative care, enhanced with AI-assisted data extraction and privacy-first de-identification. Both modules share a consistent UI/UX, support multi-hospital environments, and include granular user roles and permissions to improve healthcare efficiency and patient safety.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React, TypeScript, and Vite, with Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. It features modular Inventory, Anesthesia, and Administration sections with dynamic bottom navigation, a module drawer, and role-based visibility.

**Anesthesia Module Workflow Pages:**
- **Patients** (`/anesthesia/patients`): Master list with search and filtering.
- **Pre-OP List** (`/anesthesia/preop`): Patients awaiting pre-operative assessment.
- **OP Schedule** (`/anesthesia/op`): Calendar view for surgery scheduling with three view modes (Day/Week/Month). Day view displays surgery rooms as vertical swim lanes with time-based scheduling from 6:00 AM to 8:00 PM. Week view shows 7-day timeline. Month view provides monthly overview with surgery indicators. Features seamless zoom navigation where clicking any day in week or month view switches to day view for that date. Integrated with surgery rooms from database, styled with Poppins font to match UI. Original list view preserved but hidden for potential future use.
- **OP Monitoring System** (`/anesthesia/cases/:id/op`): Full-screen interface with Apache ECharts for vitals timeline visualization, dual y-axes, custom medical symbols, and synchronized multi-grid swimlanes (Zeiten, Ereignisse & Maßnahmen, Herzrhythmus). It supports real-time data entry, adaptive tick granularity, a three-zone editing system, and constrained zoom/pan. Interactive vitals entry allows clinicians to drop data points that snap to grid lines. The system includes an AI-powered hybrid multi-monitor camera capture system for automatic recognition and data extraction from various medical devices, using local OCR and OpenAI Vision API, with smart routing to correct swimlanes. Values are editable via React DOM overlays for reliable interaction. **Continuous Infusion Visualization**: Drug infusions are displayed as continuous horizontal lines on the timeline with vertical tick marks at rate changes, dashed lines for free-running infusions (e.g., Ringer), solid lines for rate-controlled drugs, colored red until the NOW marker and gray thereafter, updating in real-time as time progresses.
- **PACU**: Post-Anesthesia Care Unit for recovery monitoring.

Key features include barcode scanning, a signature pad, real-time item quick panels, and a hospital switcher.

### Backend
The backend uses Express.js and TypeScript with a PostgreSQL database via Drizzle ORM. It supports both external PostgreSQL databases (Exoscale, Aiven, etc.) and Replit's managed PostgreSQL. Authentication uses standard Google OAuth via passport-google-oauth20, supplemented by local email/password, with session-based authentication. The API is RESTful with JSON communication, centralized error handling, bcrypt for password hashing, and role-based access control.

### Authentication & Authorization
Viali uses a hybrid authentication strategy supporting standard Google OAuth and local email/password credentials. Google OAuth is optional and can be disabled if environment variables are not provided. Authorization is role-based and multi-hospital. A robust user management system includes creation, password changes, hospital assignment, and deletion, secured with role-based authorization and bcrypt.

### Database Schema
The database schema includes `Users`, `Hospitals` (with `anesthesiaLocationId` linking to a specific location's inventory for the anesthesia module), `UserHospitalRoles`, `Items` (with barcode support, min/max thresholds, critical/controlled flags, `trackExactQuantity`, `currentUnits`, `packSize`, anesthesia configuration fields: `administrationUnit`, `ampuleConcentration`, `administrationRoute`, `rateUnit` where null=bolus medication, "free"=free-running infusion, actual unit=rate-controlled pump), `StockLevels`, `Lots` (batch tracking, expiry), `Orders`, `OrderLines`, `Activities` (audit trails), `Alerts`, `Vendors`, `Locations`, `ImportJobs` (async bulk import), `ChecklistTemplates`, and `ChecklistCompletions`. It uses UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation.

**Schema Simplification (October 2025)**: The anesthesia configuration was simplified to use only `rateUnit` instead of separate `anesthesiaType` and `isRateControlled` fields. New hospitals automatically receive correct seed data. Existing hospitals with configured anesthesia items should reconfigure their items in Anesthesia Settings if they had free-running infusions (Ringer's, Glucose 5%, etc.) to set the correct `rateUnit: "free"` value.

### System Design Choices
The system provides comprehensive inventory management:
- **Controlled Substances Management**: Workflows for administration logging, routine verification, electronic signature capture, and monthly PDF reports.
- **Order Management**: End-to-end order creation, editing, submission, automatic quantity calculation, and PDF export.
- **Item Lifecycle Management**: Creation, updating, and transactional cascade deletion of items, with image uploads, compression, and AI photo analysis.
- **User Management**: Creation, role assignment, password changes, and deletion with strong security.
- **Signature Capture**: Print-ready electronic signatures for controlled substance transactions.
- **Custom Sorting**: Drag-and-drop functionality for organizing folders and moving items, with persistent `sortOrder` and bulk sort API endpoints.
- **Bulk Import with AI & Background Worker**: AI-powered bulk photo import using OpenAI Vision API for automated item extraction, processed via an asynchronous job queue with background worker architecture. The system reliably handles large batches (50+ images) using:
  - **Job Queue System**: Import jobs are queued in PostgreSQL and processed asynchronously by a background worker
  - **Real-time Progress Tracking**: Database-backed progress updates showing current image and percentage complete
  - **Automatic Stuck Job Detection**: Worker detects and fails jobs stuck in processing for >30 minutes
  - **Batch Processing**: Images processed in batches of 3 to stay within API rate limits while maximizing throughput
  - **Frontend Progress Display**: Live progress bar and "X/Y images (Z%)" status updates
  - **Email Notifications**: Automatic email when import completes with preview link
  - **Production Architecture**: Designed for deployment with PM2 for process management and nginx for timeout handling
  - **Zero-Timeout Uploads**: Client uploads images and receives job ID immediately; processing happens in background
- **Anesthesia Module Configuration & Access Control**: Hospitals configure an `anesthesiaLocationId` in Hospital Settings to designate which inventory location's items are available in the anesthesia module. Only users assigned to this specific location can access the anesthesia module, ensuring proper access control and enabling intelligent module defaulting. If a user is assigned to the anesthesia location, the system defaults to the anesthesia module on sign-in (if no module preference is saved). This provides a seamless workflow for anesthesia staff while maintaining security boundaries.
- **Hospital Seed Data System**: Comprehensive default data seeding system that automatically provisions new hospitals with essential configurations. Centralized configuration in `server/seed-data.ts` defines 4 default locations (Anesthesy, OR, ER, ICU), 3 surgery rooms (OP1-OP3), 5 administration groups (Infusions, Pumps, Bolus, Short IVs, Antibiotics), and 13 pre-configured medications including Propofol with specialized rate-controlled administration (mg/kg/h). The system features:
  - **Automatic Seeding**: Both Google OAuth and email/password signup flows automatically seed new hospitals
  - **Manual Seeding**: Admin UI button ("Seed Default Data") for seeding existing hospitals
  - **Additive-Only Logic**: Only creates missing items, never replaces existing customizations (safe, idempotent)
  - **User Assignment**: Automatically assigns creating user as admin to Anesthesy location and configures anesthesiaLocationId
  - **Centralized Configuration**: All default data maintained in `server/seed-data.ts` for easy editing and expansion
  - **Query Invalidation**: UI automatically refreshes after manual seeding to show newly created items

### Universal Value Editing System
The `EditableValue` component provides a consistent click-to-edit experience across modules for various data types (text, number, date, vital-point), including time-based editing for vital signs. It supports validation, optional deletion, and is responsive.

## External Dependencies

**Database:**
- Neon Serverless PostgreSQL

**Authentication Services:**
- Google OAuth 2.0 (via passport-google-oauth20)
- Passport.js
- connect-pg-simple (PostgreSQL session store)

**UI Component Libraries:**
- Radix UI
- Shadcn/ui
- Lucide React & Font Awesome

**Data Visualization:**
- Apache ECharts
- echarts-for-react
- DayPilot Lite (calendar and scheduling)

**Development Tools:**
- Vite plugins
- Drizzle Kit
- Zod

**Barcode Scanning:**
- Browser native camera API

**Form Management:**
- React Hook Form

**Utilities:**
- bcrypt
- date-fns
- nanoid
- memoizee
- jsPDF & jspdf-autotable

**Email Service:**
- Resend (direct API integration)

**AI Services:**
- OpenAI Vision API (for image analysis and OCR)
- OpenAI GPT-4 (for voice transcription and drug command parsing)

## Environment Variables

### Required Variables (Both Development & Production)

```bash
# Database Connection
DATABASE_URL="postgres://user:password@host:port/database?sslmode=require"

# Session Security
SESSION_SECRET="your-long-random-secret-minimum-32-characters"

# Data Encryption (for patient data)
ENCRYPTION_SECRET="another-long-random-secret-minimum-32-characters"

# OpenAI API (for AI features)
OPENAI_API_KEY="sk-proj-xxxxxxxxxxxxx"
```

### Optional Variables

```bash
# Google OAuth (optional - if not provided, only email/password auth works)
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# Email Service (optional - if not provided, email features disabled)
RESEND_API_KEY="re_xxxxxxxxxxxxx"
RESEND_FROM_EMAIL="noreply@yourdomain.com"

# Production URL (for OAuth callbacks and email links)
PRODUCTION_URL="https://yourdomain.com"

# Server Port (defaults to 5000)
PORT="5000"

# Database SSL Certificate Validation (optional)
# Set to 'false' ONLY if using self-signed certificates (e.g., development)
# Default: true (secure - validates certificates)
DB_SSL_REJECT_UNAUTHORIZED="false"
```

### Generating Secrets

Use Node.js to generate random secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deployment

### Self-Hosting on Exoscale (or any server)

Viali can be deployed on any server with Node.js and PostgreSQL. The application uses a **background worker architecture** for reliable bulk image processing.

**Prerequisites:**
- Node.js 20 or higher
- PostgreSQL database (Exoscale, Aiven, or any provider)
- PM2 process manager (for managing app + worker)
- nginx web server (for reverse proxy and timeout handling)
- SSH access to your server

**Quick Start:**

1. **Set up PostgreSQL database**:
   - Create a database on your provider
   - Note the connection string with SSL support

2. **Clone and install**:
   ```bash
   git clone your-repo-url
   cd viali
   npm install
   ```

3. **Configure environment**:
   Create a `.env` file with all required variables (see Environment Variables section above).

4. **Apply database schema**:
   ```bash
   npm run db:push --force
   ```

5. **Start with PM2** (runs both app and background worker):
   ```bash
   npm install -g pm2
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup  # Enable auto-start on reboot
   ```

6. **Configure nginx** for reverse proxy and proper timeout handling:
   - Set `client_max_body_size 100M` for bulk uploads
   - Configure proxy timeouts (60s recommended)
   - See `DEPLOYMENT.md` for complete nginx configuration

**Important Files:**
- `ecosystem.config.js`: PM2 configuration for app + worker processes
- `server/worker.ts`: Background worker for processing import jobs
- `DEPLOYMENT.md`: Comprehensive deployment guide with nginx config, monitoring, troubleshooting, and production best practices

**Architecture:**
- **Main App**: Handles web requests, queues import jobs (PM2 process: `viali-app`)
- **Background Worker**: Processes jobs asynchronously with progress tracking (PM2 process: `viali-worker`)
- **Database**: PostgreSQL job queue with real-time progress updates
- **nginx**: Handles uploads and proxies to the app with proper timeout configuration

**For complete deployment instructions including:**
- Detailed nginx configuration
- PM2 monitoring and management
- Stuck job detection and cleanup
- Log management and rotation
- Backup strategies
- Troubleshooting guide

**See the full [DEPLOYMENT.md](./DEPLOYMENT.md) guide.**

### Google OAuth Setup

To enable Google OAuth login:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `https://yourdomain.com/api/auth/google/callback`
5. Copy the Client ID and Client Secret to your environment variables

### Resend Email Setup

To enable email features:

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain or use their test domain
3. Create an API key
4. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in your environment variables