# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application designed for hospital operations, featuring two primary modules: Inventory Management and Anesthesia Records. The Inventory module optimizes the management of anesthesia drugs and general consumables across multiple hospitals, aiming to prevent stockouts, minimize waste from expired items, automate reordering using Min-Max rules, and ensure compliance for controlled substances. The Anesthesia module streamlines patient case management, covering pre-operative assessments, intra-operative documentation, and post-operative care, enhanced with AI-assisted data extraction and privacy-first de-identification. Both modules share a consistent UI/UX design and support multi-hospital environments with granular user roles and permissions, addressing critical needs in healthcare efficiency and patient safety.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React and TypeScript, leveraging Vite for development and bundling. It uses Wouter for routing, TanStack Query for server state management, and Shadcn/ui (based on Radix UI) with Tailwind CSS for a mobile-first, responsive design. The application is modular, featuring independent Inventory, Anesthesia, and Administration modules, each with dedicated routes and dynamic bottom navigation. A module drawer and role-based visibility manage access, with user preferences for module auto-detection and home redirection.

**Anesthesia Module Workflow Pages:**
- **Patients** (`/anesthesia/patients`): Master list of all patients with search and filtering
- **Pre-OP List** (`/anesthesia/preop`): List of patients awaiting pre-operative assessment with search functionality, showing patient demographics, planned surgery details, surgeon, and planned date with "Awaiting Assessment" status badges. Cards link to case-specific pre-op assessment forms
- **OP List** (`/anesthesia/op`): List of active surgeries currently in progress with search functionality, showing patient demographics, surgery details, surgeon, start time with duration calculation, and OR location. Cards have green styling and "In Progress" status badges, linking to case-specific OP monitoring pages
- **OP Monitoring System** (`/anesthesia/cases/:id/op`): Full-screen dialog interface with vitals timeline visualization (BP, HR, Temp, SpO2), clinical swimlanes for events, infusions, drugs, and staff, and tabbed documentation sections for comprehensive intraoperative record-keeping
- **PACU**: Post-Anesthesia Care Unit - patients in recovery with Aldrette scores and pain levels

Key features include barcode scanning, a signature pad, real-time item quick panels, and a hospital switcher for multi-tenant environments.

### Backend
The backend is developed with Express.js and TypeScript, interacting with a PostgreSQL database via Drizzle ORM, hosted on Neon serverless PostgreSQL. Authentication uses OpenID Connect (OIDC) via Replit Auth, supplemented by local email/password authentication, employing session-based authentication with a PostgreSQL session store. The API is RESTful, focusing on resource-based endpoints, JSON communication, centralized error handling, bcrypt for password hashing, and role-based access control.

### Authentication & Authorization
Viali uses a hybrid authentication strategy supporting Google OAuth (OIDC) and local credentials, configurable per hospital. Authorization is role-based and multi-hospital, with permissions defined per hospital. A robust user management system includes user creation, password changes, hospital assignment, and deletion, secured with AD role authorization and bcrypt hashing.

### Database Schema
The database schema includes `Users`, `Hospitals`, `UserHospitalRoles`, `Items` (with barcode support, min/max thresholds, critical/controlled flags, `trackExactQuantity`, `currentUnits`, `packSize`), `StockLevels`, `Lots` (for batch tracking and expiry), `Orders`, `OrderLines`, `Activities` (audit trails), `Alerts`, `Vendors`, `Locations`, `ImportJobs` (for async bulk import), `ChecklistTemplates`, and `ChecklistCompletions`. UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation for dynamic data are key design decisions.

### System Design Choices
The system provides comprehensive inventory management, including:
- **Controlled Substances Management**: Workflows for administration logging, routine verification, electronic signature capture, and monthly PDF reports.
- **Order Management**: End-to-end order creation, editing, submission, automatic quantity calculation, and PDF export.
- **Item Lifecycle Management**: Creation, updating, and transactional cascade deletion of items, with image uploads, compression, and AI photo analysis for item identification.
- **User Management**: Creation, role assignment, password changes, and deletion with strong security.
- **Signature Capture**: Print-ready electronic signatures for controlled substance transactions.
- **Custom Sorting**: Drag-and-drop functionality for organizing folders and moving items, with persistent `sortOrder` and bulk sort API endpoints.
- **Bulk Import with AI**: AI-powered bulk photo import using OpenAI Vision API for automated item extraction, processed via an asynchronous job queue with email notifications and real-time status updates.

## External Dependencies

**Database:**
- Neon Serverless PostgreSQL

**Authentication Services:**
- Replit OIDC Provider
- connect-pg-simple

**UI Component Libraries:**
- Radix UI
- Shadcn/ui
- Lucide React & Font Awesome

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