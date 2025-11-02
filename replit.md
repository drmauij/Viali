# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application designed to optimize hospital operations. It features an Inventory Management module that prevents stockouts, minimizes waste, automates reordering, and ensures compliance for controlled substances across multiple hospitals. The Anesthesia Records module streamlines patient case management from pre-operative to post-operative care, integrating AI-assisted data extraction. The system emphasizes a consistent UI/UX, multi-hospital support, and granular user roles to enhance healthcare efficiency and patient safety.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React, TypeScript, and Vite, utilizing Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. It comprises modular Inventory, Anesthesia, and Administration sections with dynamic navigation and role-based visibility.

**Key Anesthesia Module Features:**
- **OP Schedule:** Interactive calendar view with Day/Week/Month modes, displaying surgery rooms as vertical swim lanes with time-based scheduling. Supports drag-and-drop rescheduling, event resize for duration adjustment, quick surgery creation via time range selection with patient search/creation, and surgery cancellation/reactivation with visual indicators.
- **OP Monitoring System:** Full-screen interface with Apache ECharts for vitals timeline visualization, real-time data entry, adaptive tick granularity, and a three-zone editing system. It includes AI-powered multi-monitor camera capture for data extraction via local OCR and OpenAI Vision API, with continuous infusion visualization.
- **Pre-Op Overview Tab:** Compact, read-only summary of pre-operative assessment data displayed in the OP dialog, providing quick reference during surgery and handover. Shows only filled fields organized into logical sections (Allergies & CAVE, ASA & Vitals, Medications, Medical History, Airway, Fasting, Planned Anesthesia, Installations, Surgical Approval).
- **Auto-Creation of Anesthesia Records:** When opening the OP dialog for a surgery without an anesthesia record, the system automatically creates one. The creation logic is StrictMode-safe, setting a ref guard before the fetch to prevent duplicate creation attempts during React 18's double-mount behavior.
- Barcode scanning, signature pads, real-time item quick panels, and a hospital switcher are integrated throughout.

### Backend
The backend uses Express.js and TypeScript with a PostgreSQL database managed by Drizzle ORM. Authentication supports standard Google OAuth and local email/password via passport-google-oauth20, employing session-based authentication. The API is RESTful, featuring centralized error handling, bcrypt for password hashing, and role-based access control.

### Authentication & Authorization
Viali employs a hybrid authentication strategy (Google OAuth and local email/password) with robust role-based and multi-hospital authorization. A comprehensive user management system handles creation, password changes, and hospital assignments, secured with bcrypt.

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