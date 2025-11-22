# Viali - Hospital Inventory Management System

## Overview
Viali is a mobile-first web application designed to optimize hospital operations. Its primary purpose is to provide a robust Inventory Management module to prevent stockouts, minimize waste, and automate the reordering process, including controlled substances, across multiple hospital facilities. Additionally, it features an Anesthesia Records module that streamlines patient case management with AI-assisted data extraction. The system aims to enhance healthcare efficiency and patient safety through consistent UI/UX, multi-hospital support, and granular user role management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React, TypeScript, and Vite, utilizing Wouter for routing, TanStack Query for state management, and Shadcn/ui (Radix UI) with Tailwind CSS for a mobile-first design. It comprises modular Inventory, Anesthesia, and Administration sections with dynamic navigation and role-based visibility. Key features include an interactive OP Schedule with drag-and-drop functionality, a full-screen OP Monitoring System with Apache ECharts for vitals visualization and AI-powered data extraction, contextual medication configuration directly from vitals charts, and automated anesthesia record creation. It also supports integrated barcode scanning, signature pads, real-time item quick panels, and a hospital switcher.

### Backend
The backend is developed using Express.js and TypeScript, with a PostgreSQL database managed by Drizzle ORM. Authentication supports standard Google OAuth and local email/password via Passport.js, employing session-based authentication. The API is RESTful, featuring centralized error handling, bcrypt for password hashing, and role-based access control.

### Authentication & Authorization
Viali implements a hybrid authentication strategy (Google OAuth and local email/password) combined with robust role-based and multi-hospital authorization. A comprehensive user management system handles user creation, password changes, and hospital assignments. Data isolation between hospitals is enforced at the API layer through authorization, query parameter filtering, and resource-based authorization.

### Database Schema
The database schema includes entities for Users, Hospitals, UserHospitalRoles, Items (with barcode support, min/max thresholds, controlled flags), StockLevels, Lots, Orders, Activities (audit trails), and Alerts. It utilizes UUID primary keys, timestamp tracking, separate lot tracking, and JSONB fields with Zod validation. Schema changes are managed via Drizzle ORM, with an automated workflow for migration generation and execution on server startup.

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
- **Automated Inventory Usage Calculation**: Intelligent system for automatically calculating medication usage from timeline administration data, supporting manual overrides with audit trails.
- **Anesthesia Documentation & Checklists**: Comprehensive case documentation system covering technique documentation and WHO Surgical Safety Checklist phases with electronic signatures and server-side audit trails.

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