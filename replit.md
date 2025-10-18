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
- **OP Monitoring System** (`/anesthesia/cases/:id/op`): Full-screen dialog interface with professional Apache ECharts-based vitals timeline visualization featuring dual y-axes (0-240 for BP/HR, 50-100 for SpO2), custom medical symbols (BP carets with filled areas, HR hearts, SpO2 circles), built-in zoom/pan interactions, synchronized multi-grid swimlanes (Zeiten, Ereignisse & Maßnahmen, Herzrhythmus), and tabbed documentation sections for comprehensive intraoperative record-keeping using German medical terminology. The UnifiedTimeline component starts with an empty chart ready for real-time data entry, with vertical grid lines synchronized from initial render, adaptive 5-minute/15-minute tick granularity based on zoom level, three-zone editing system (past non-editable, current 70-minute editable window from NOW-10min to NOW+60min, future non-editable), and constrained zoom/pan operations that stay within data bounds. Interactive vitals entry system allows clinicians to click on vitals icons (Heart, BP, SpO2) to activate tool modes, then hover over the chart to see real-time value/time tooltips, and click to drop data points that automatically snap to the nearest vertical grid line using ECharts API-based interval detection that queries actual tick coordinates (instead of hardcoded zoom levels) for precise snapping across all screen sizes and zoom states. Data points render as red hearts for HR, red triangles for BP, and purple circles for SpO2, with coordinate conversion ensuring accurate value mapping to their respective y-axes. **Icon Interaction System**: All vital icons use proper ECharts `zlevel` layering (icons on zlevel 100/30, lines on default zlevel 0) to ensure icons are always clickable above connection lines. Icons feature 1.3x scale hover enlargement with thicker stroke (2.5px) detected via `params.emphasisItemStyle` for improved click targeting and visual feedback. **Coordinate System & Editing**: All timeline graphics (medication doses, ventilation parameters) use `xAxisIndex: 0` for coordinate conversion via `timestampToPixel()` to ensure proper scrolling synchronization. Ventilation parameter rows calculate vertical position using raw `paramIndex` to match swimlane ordering. Both medication doses and ventilation values are fully editable via onclick handlers that open edit dialogs with save/delete functionality, allowing clinicians to modify or remove any data point. **Enhanced Multi-Monitor Camera Capture System**: AI-powered hybrid system supporting automatic recognition of multiple monitor types (vitals, ventilation, TOF nerve stimulator, perfusor/infusion pumps). Preprocesses images (768px resize, grayscale, JPEG compression), attempts fast local seven-segment OCR first (>90% confidence), then falls back to OpenAI Vision API for complex/low-confidence readings. The AI automatically classifies monitor type and extracts ALL visible parameters semantically using multilingual parameter mapping (supports 32+ parameters including German/English aliases: AF→RR, VTe→Tidal Volume, FiO2, EtCO2, HR/HF, BP/RR, etc.). Smart routing logic automatically places parameters on correct swimlanes based on category (vitals→chart, ventilation→ventilation swimlane, perfusor→perfusor swimlane). Enhanced confirmation dialog displays monitor type badge, confidence level, detection method indicator (⚡ Fast OCR or 🤖 AI Enhanced), parameters grouped by category with standard name mappings, and target swimlane indicators, providing quick verification before data placement
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

## Universal Value Editing System

### EditableValue Component
The application includes a universal value editing system that allows any value to be edited by clicking on it. This provides a consistent editing experience across all modules.

**Key Features:**
- **Click-to-Edit**: Click or tap any wrapped value to open an edit dialog
- **Time-Based Editing**: For vital signs and time-series data, edit both value and timestamp
- **Type Support**: Handles text, numbers, dates, and vital points (value + time)
- **Validation**: Built-in min/max constraints for numeric values
- **Delete Functionality**: Optional delete button for removable values
- **Responsive**: Works on both desktop and mobile devices

**Usage Example:**
```typescript
import { EditableValue } from "@/components/EditableValue";

// Simple number edit
<EditableValue
  type="number"
  value={temperature}
  label="Temperature"
  onSave={(value) => setTemperature(value)}
  min={30}
  max={45}
  step={0.1}
>
  <span>{temperature}°C</span>
</EditableValue>

// Vital sign with time editing
<EditableValue
  type="vital-point"
  value={120}
  time={Date.now()}
  label="Heart Rate"
  onSave={(value, time) => saveVital(value, time)}
  onDelete={() => deleteVital()}
  allowTimeEdit={true}
  allowDelete={true}
  min={40}
  max={200}
>
  <span>{120} bpm</span>
</EditableValue>
```

**Supported Types:**
- `text` - String values
- `number` - Numeric values with optional min/max/step validation
- `date` - Date picker
- `vital-point` - Numeric value with timestamp editing and optional delete

**Demo Page:**
A comprehensive demo showing all value types is available at `/demo/editable-values` when authenticated.