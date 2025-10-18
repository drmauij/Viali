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
- **OP List** (`/anesthesia/op`): Active surgeries with real-time status.
- **OP Monitoring System** (`/anesthesia/cases/:id/op`): Full-screen interface with Apache ECharts for vitals timeline visualization, dual y-axes, custom medical symbols, and synchronized multi-grid swimlanes (Zeiten, Ereignisse & Maßnahmen, Herzrhythmus). It supports real-time data entry, adaptive tick granularity, a three-zone editing system, and constrained zoom/pan. Interactive vitals entry allows clinicians to drop data points that snap to grid lines. The system includes an AI-powered hybrid multi-monitor camera capture system for automatic recognition and data extraction from various medical devices, using local OCR and OpenAI Vision API, with smart routing to correct swimlanes. Values are editable via React DOM overlays for reliable interaction.
- **PACU**: Post-Anesthesia Care Unit for recovery monitoring.

Key features include barcode scanning, a signature pad, real-time item quick panels, and a hospital switcher.

### Backend
The backend uses Express.js and TypeScript with a PostgreSQL database via Drizzle ORM, hosted on Neon serverless PostgreSQL. Authentication uses OpenID Connect (OIDC) via Replit Auth, supplemented by local email/password, with session-based authentication. The API is RESTful with JSON communication, centralized error handling, bcrypt for password hashing, and role-based access control.

### Authentication & Authorization
Viali uses a hybrid authentication strategy supporting Google OAuth (OIDC) and local credentials, configurable per hospital. Authorization is role-based and multi-hospital. A robust user management system includes creation, password changes, hospital assignment, and deletion, secured with AD role authorization and bcrypt.

### Database Schema
The database schema includes `Users`, `Hospitals`, `UserHospitalRoles`, `Items` (with barcode support, min/max thresholds, critical/controlled flags, `trackExactQuantity`, `currentUnits`, `packSize`), `StockLevels`, `Lots` (batch tracking, expiry), `Orders`, `OrderLines`, `Activities` (audit trails), `Alerts`, `Vendors`, `Locations`, `ImportJobs` (async bulk import), `ChecklistTemplates`, and `ChecklistCompletions`. It uses UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation.

### System Design Choices
The system provides comprehensive inventory management:
- **Controlled Substances Management**: Workflows for administration logging, routine verification, electronic signature capture, and monthly PDF reports.
- **Order Management**: End-to-end order creation, editing, submission, automatic quantity calculation, and PDF export.
- **Item Lifecycle Management**: Creation, updating, and transactional cascade deletion of items, with image uploads, compression, and AI photo analysis.
- **User Management**: Creation, role assignment, password changes, and deletion with strong security.
- **Signature Capture**: Print-ready electronic signatures for controlled substance transactions.
- **Custom Sorting**: Drag-and-drop functionality for organizing folders and moving items, with persistent `sortOrder` and bulk sort API endpoints.
- **Bulk Import with AI**: AI-powered bulk photo import using OpenAI Vision API for automated item extraction, processed via an asynchronous job queue.

### Universal Value Editing System
The `EditableValue` component provides a consistent click-to-edit experience across modules for various data types (text, number, date, vital-point), including time-based editing for vital signs. It supports validation, optional deletion, and is responsive.

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

**Data Visualization:**
- Apache ECharts
- echarts-for-react

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