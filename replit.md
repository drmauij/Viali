# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application designed to optimize hospital operations. Its primary purpose is to provide a robust Inventory Management module to prevent stockouts, minimize waste, and automate the reordering process, including controlled substances, across multiple hospital facilities. Additionally, it features an Anesthesia Records module that streamlines patient case management with AI-assisted data extraction. The system aims to enhance healthcare efficiency and patient safety through consistent UI/UX, multi-hospital support, and granular user role management.

## User Preferences
Preferred communication style: Simple, everyday language.

Deployment Environment: The application is deployed to a custom server on **Exoscale** (Ubuntu-based VPS), NOT on Replit. Do not search Replit documentation for deployment-related issues. The user has sudo access and full control over the server environment.

## System Architecture

### Frontend
The frontend is built with React, TypeScript, and Vite, utilizing Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. Key features include an interactive OP Schedule with drag-and-drop, a full-screen OP Monitoring System with Apache ECharts for vitals visualization and AI-powered data extraction, and integrated barcode scanning. The system supports dynamic navigation and role-based visibility across Inventory, Anesthesia, and Administration modules.

### Backend
The backend uses Express.js and TypeScript, with a PostgreSQL database managed by Drizzle ORM. Authentication supports Google OAuth and local email/password via Passport.js, employing session-based authentication. The API is RESTful, featuring centralized error handling, bcrypt for password hashing, and role-based access control. The backend follows a modular architecture for improved maintainability, with domain-specific route modules for authentication, inventory, administration, checklists, and anesthesia. Key backend services include AI-powered medical monitor OCR and patient data encryption.

### Authentication & Authorization
Viali implements a hybrid authentication strategy (Google OAuth and local email/password) combined with robust role-based and multi-hospital authorization. A comprehensive user management system handles user creation, password changes, and hospital assignments. Data isolation between hospitals is enforced at the API layer.

### Database Schema
The database schema includes entities for Users, Hospitals, UserHospitalRoles, Items, StockLevels, Lots, Orders, Activities (audit trails), and Alerts. It utilizes UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation. Schema changes are managed via Drizzle ORM, with an automated workflow for migration generation and execution on server startup. Migrations are carefully reviewed and converted to idempotent patterns before deployment.

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
- **Automated Inventory Usage Calculation**: Intelligent system for automatically calculating medication usage from timeline administration data with real-time synchronization.
- **Anesthesia Documentation & Checklists**: Comprehensive case documentation system covering technique documentation and WHO Surgical Safety Checklist phases with electronic signatures and server-side audit trails.
- **Common Event Quick-Add System**: Streamlined event logging with one-click common event buttons.
- **OP Calendar Timeline Status Indicators**: Color-coded surgery status visualization in OP calendar.
- **Full English/German Localization (i18next)**: Comprehensive internationalization implementation covering the entire application with 600+ translation keys across major pages.
- **Comprehensive PDF Export with Visual Charts**: Complete anesthesia record PDF generation system featuring native jsPDF chart rendering for comprehensive surgical documentation. Includes five visual timeline sections: Vital Signs, Medications & Infusions, Ventilation Parameters, Fluid Balance & Output, and Heart Rhythm.
- **Historical Record Viewport Centering**: The timeline automatically detects historical records and centers the viewport on the actual data range.
- **Record Locking System**: Anesthesia records are automatically locked when the PACU End (A2) marker is set.

## Planned Features

### Ambulatory Invoice Module (Future Implementation)
A new module to enable invoicing for ambulatory/outpatient services, integrating with existing patient and inventory data.

**Reference Implementation:** Based on [Rechnung-Ersteller](https://github.com/drmauij/Rechnung-Ersteller) - a simple German invoice management app.

#### Core Features
1. **Invoice Creation** - Select patient, add line items, calculate totals with VAT
2. **Patient Integration** - Use existing patients table as invoice recipients
3. **Item Integration** - Use existing inventory items with patient pricing
4. **PDF Generation** - Professional invoice PDFs with clinic branding
5. **Invoice History** - List and search past invoices
6. **Auto-incrementing Invoice Numbers** - Sequential numbering per hospital

#### Database Changes Required

**New field in `items` table:**
```sql
patientPrice: decimal("patient_price", { precision: 10, scale: 2 })
```
- This is the "Abgabepreis patient final" (final patient dispensing price)
- Distinct from supplier prices (basispreis, publikumspreis) which represent costs
- Used for calculating invoice totals

**New tables needed:**
```
ambulatory_invoices:
  - id, hospitalId, invoiceNumber, date
  - patientId (references patients)
  - customerName, customerAddress fields
  - subtotal, vatRate, vatAmount, total
  - comments, status
  - createdBy, createdAt

ambulatory_invoice_items:
  - id, invoiceId, itemId
  - description, quantity, unitPrice, total
```

#### Bulk Import Enhancement
Adapt existing CSV import in `client/src/pages/Items.tsx` to support:
1. **Excel (XLSX) parsing** - Currently only CSV supported
2. **Pharmacode matching** - Match existing items by pharmacode when available
3. **Patient price import** - New `patientPrice` field mapping
4. **Update mode** - Match by pharmacode OR name, update prices (not just create)

**Expected Excel columns:**
- Item Name
- Pharmacode (for matching)
- Supplier Price (basispreis)
- Supplier = Galexis
- Patient Price (new patientPrice field)

#### Implementation Estimate
- Database schema + migration: ~30 min
- Backend routes (CRUD for invoices): ~1-2 hours
- Invoice creation page (patient select, item picker, calculations): ~2-3 hours
- Invoice list/history page: ~1 hour
- PDF invoice generation: ~1-2 hours
- Patient price field in items + import enhancement: ~1-2 hours
- Translations (EN/DE): ~30 min

**Total: ~8-12 hours (2-3 sessions)**

#### Architecture Notes
- Follows existing module patterns (routing, storage, shared schema)
- Reuses existing components: patient lookup, item selection, PDF generation (jsPDF)
- Access controlled via role-based permissions per hospital
- Multi-hospital support with data isolation

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