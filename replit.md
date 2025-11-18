# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application for hospital operations, featuring an Inventory Management module to prevent stockouts, minimize waste, and automate reordering, including controlled substances across multiple hospitals. Its Anesthesia Records module streamlines patient case management with AI-assisted data extraction. The system prioritizes consistent UI/UX, multi-hospital support, and granular user roles to enhance healthcare efficiency and patient safety.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React, TypeScript, and Vite, with Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. It includes modular Inventory, Anesthesia, and Administration sections with dynamic navigation and role-based visibility.

Key Anesthesia Module features include:
- **OP Schedule**: An interactive calendar with Day/Week/Month/Agenda views for surgery rooms, supporting drag-and-drop rescheduling, quick surgery creation, and cancellation. It uses a European date/time format and has full dark theme support, responsive controls for mobile, and seamless page-level scrolling. The Week View is a custom `react-calendar-timeline` implementation with local state tracking for consistency during rapid changes.
- **OP Monitoring System**: A full-screen interface featuring Apache ECharts for vitals timeline visualization, real-time data entry, and AI-powered multi-monitor camera capture for data extraction via local OCR and OpenAI Vision API, with continuous infusion visualization.
- **Contextual Medication Configuration**: Administration groups in the anesthesia record timeline are clickable, allowing clinicians to configure medications directly from the vitals chart. Clicking a group opens a dialog where users can select inventory items, configure medication settings (dose, route, rate unit, ampule content), and immediately add them to the clicked group. This provides better context compared to configuring medications in a separate settings page.
- **Pre-Op Overview Tab**: A compact, read-only summary of pre-operative assessment data within the OP dialog for quick reference.
- **Auto-Creation of Anesthesia Records**: Automatically creates an anesthesia record when opening the OP dialog for a surgery that lacks one, with StrictMode-safe logic to prevent duplicates.
- Integrated barcode scanning, signature pads, real-time item quick panels, and a hospital switcher.

### Backend
The backend uses Express.js and TypeScript with a PostgreSQL database managed by Drizzle ORM. Authentication supports standard Google OAuth and local email/password via Passport.js, employing session-based authentication. The API is RESTful with centralized error handling, bcrypt for password hashing, and role-based access control.

### Authentication & Authorization
Viali uses a hybrid authentication strategy (Google OAuth and local email/password) with robust role-based and multi-hospital authorization. A user management system handles creation, password changes, and hospital assignments, secured with bcrypt. Data isolation between hospitals is enforced through API layer authorization, query parameter filtering, and resource-based authorization, with hospital-specific cache invalidation on the frontend.

### Database Schema
The database includes entities for Users, Hospitals, UserHospitalRoles, Items (with barcode support, min/max thresholds, controlled flags), StockLevels, Lots, Orders, Activities (audit trails), and Alerts. It uses UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation.

### System Design Choices
- **Controlled Substances Management**: Workflows for administration logging, verification, electronic signature, and PDF reports.
- **Order Management**: End-to-end order creation, submission, and PDF export.
- **Item Lifecycle Management**: Creation, updating, and transactional deletion of items with image uploads and AI photo analysis.
- **User Management**: Secure user creation, role assignment, and password management.
- **Custom Sorting**: Drag-and-drop functionality for organizing items and folders with persistent `sortOrder`.
- **Bulk Import with AI & Background Worker**: AI-powered bulk photo import using OpenAI Vision API, processed via an asynchronous job queue.
- **Anesthesia Module Configuration & Access Control**: Hospitals configure a specific inventory location for the anesthesia module, with access restricted to users assigned to that location.
- **Hospital Seed Data System**: Automatic and manual provisioning of new hospitals with essential default data, ensuring an idempotent and additive seeding process.
- **Universal Value Editing System**: `EditableValue` component for consistent click-to-edit functionality across various data types.
- **Point-Based Vitals System (Nov 2025)**: Complete redesign of vitals storage from multiple snapshot rows to a single row per anesthesia record with arrays of points. Each point has a unique UUID, timestamp, and value, enabling proper CRUD operations. The system uses React Query for optimistic updates and data synchronization, with a conversion layer maintaining backward compatibility with the existing ECharts-based UI. This eliminates the O(n²) snapshot aggregation that was blocking UI for 700-900ms and provides granular point-level edit/delete capabilities.
- **Anesthesia Timeline CRUD Redesign (Nov 2025)**: Systematic implementation of full CRUD operations for all timeline swimlanes using React Query as single source of truth. Completed swimlanes: Times (13 predefined markers stored in JSONB), Events (text annotations in separate table), Heart Rhythm (string-based rhythm values in JSONB points), Medications (infusions/boluses in separate table with full CRUD), and Position (patient positioning in separate table). Each swimlane has dedicated mutation hooks with proper cache invalidation, Zod validation with whitelisted fields in PATCH endpoints, and security controls to prevent unauthorized data migration across records.

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