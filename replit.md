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
The database schema includes `Users`, `Hospitals` (with `anesthesiaLocationId` linking to a specific location's inventory for the anesthesia module), `UserHospitalRoles`, `Items` (with barcode support, min/max thresholds, critical/controlled flags, `trackExactQuantity`, `currentUnits`, `packSize`, anesthesia configuration fields: `anesthesiaType`, `administrationUnit`, `ampuleConcentration`, `administrationRoute`, `isRateControlled`, `rateUnit`), `StockLevels`, `Lots` (batch tracking, expiry), `Orders`, `OrderLines`, `Activities` (audit trails), `Alerts`, `Vendors`, `Locations`, `ImportJobs` (async bulk import), `ChecklistTemplates`, and `ChecklistCompletions`. It uses UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation.

### System Design Choices
The system provides comprehensive inventory management:
- **Controlled Substances Management**: Workflows for administration logging, routine verification, electronic signature capture, and monthly PDF reports.
- **Order Management**: End-to-end order creation, editing, submission, automatic quantity calculation, and PDF export.
- **Item Lifecycle Management**: Creation, updating, and transactional cascade deletion of items, with image uploads, compression, and AI photo analysis.
- **User Management**: Creation, role assignment, password changes, and deletion with strong security.
- **Signature Capture**: Print-ready electronic signatures for controlled substance transactions.
- **Custom Sorting**: Drag-and-drop functionality for organizing folders and moving items, with persistent `sortOrder` and bulk sort API endpoints.
- **Bulk Import with AI**: AI-powered bulk photo import using OpenAI Vision API for automated item extraction, processed via an asynchronous job queue.
- **Anesthesia Module Configuration & Access Control**: Hospitals configure an `anesthesiaLocationId` in Hospital Settings to designate which inventory location's items are available in the anesthesia module. Only users assigned to this specific location can access the anesthesia module, ensuring proper access control and enabling intelligent module defaulting. If a user is assigned to the anesthesia location, the system defaults to the anesthesia module on sign-in (if no module preference is saved). This provides a seamless workflow for anesthesia staff while maintaining security boundaries.

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

# Barcode Lookup API (optional)
EAN_SEARCH_API_KEY="your-ean-api-key"
```

### Generating Secrets

Use Node.js to generate random secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deployment

### Self-Hosting on Exoscale (or any server)

Viali can be deployed on any server with Node.js and PostgreSQL. Here's how to deploy on Exoscale:

**Prerequisites:**
- Node.js 20 or higher
- PostgreSQL database (Exoscale, Aiven, or any provider)
- SSH access to your server

**Steps:**

1. **Set up PostgreSQL database** (if not done):
   - Create a database on Exoscale, Aiven, or your preferred provider
   - Note the connection string with SSL support

2. **Clone your repository**:
   ```bash
   git clone your-repo-url
   cd viali
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Set environment variables**:
   Create a `.env` file with all required variables listed above, or use PM2 ecosystem config.

5. **Build the application**:
   ```bash
   npm run build
   ```

6. **Start with PM2** (recommended):
   ```bash
   npm install -g pm2
   pm2 start npm --name "viali" -- start
   pm2 save
   pm2 startup  # Enable auto-start on reboot
   ```

7. **Set up Nginx** (optional, for reverse proxy):
   Configure Nginx to proxy requests to your Node.js app on port 5000.

**Database Migrations:**
The app automatically runs database migrations on startup, so no manual migration steps are needed.

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