# Viali - Hospital Inventory Management System

## Overview

Viali is a mobile-first web application designed for comprehensive inventory management of anesthesia drugs and general consumables across multiple hospitals. Its primary purpose is to prevent critical stockouts, minimize waste from expired items, automate reordering using Min-Max rules, ensure compliance for controlled substances, and provide multi-hospital management with granular user roles and permissions. The project aims to streamline hospital operations, improve patient safety, and reduce operational costs by optimizing inventory workflows.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React and TypeScript, utilizing Vite for fast development and bundling. Wouter handles client-side routing, while TanStack Query manages server state and caching. UI components are developed using Shadcn/ui (based on Radix UI primitives) and styled with Tailwind CSS, adhering to a mobile-first responsive design philosophy. Key features include a mobile-optimized bottom navigation, barcode scanning, a signature pad for documentation, real-time item quick panels, and a hospital switcher for multi-tenant environments.

### Backend Architecture

The backend uses Express.js with TypeScript, interfacing with a PostgreSQL database via Drizzle ORM. Neon serverless PostgreSQL provides the database infrastructure. Authentication is handled through OpenID Connect (OIDC) via Replit Auth, supplemented by local email/password authentication, using session-based authentication with a PostgreSQL session store. The API follows a RESTful design, with a focus on resource-based endpoints, JSON communication, centralized error handling, and robust security measures including bcrypt for password hashing and role-based access control.

### Authentication & Authorization

Viali employs a hybrid authentication strategy supporting both Google OAuth (via OIDC) and local credentials, with configurable methods per hospital. Authorization is role-based and multi-hospital, meaning user permissions are defined per hospital. A robust user management system allows for user creation, password changes, hospital assignment, and permanent deletion, all secured with AD role authorization and bcrypt hashing.

### Database Schema

The core database schema includes `Users`, `Hospitals`, `UserHospitalRoles` (for role-based access control), `Items` (with barcode support, min/max thresholds, flags for critical/controlled items, and `controlledUnits` field for tracking individual ampules), `StockLevels`, `Lots` (for batch tracking and expiry), `Orders`, `OrderLines`, `Activities` (for audit trails), `Alerts`, `Vendors`, and `Locations`. Key design decisions include UUID primary keys, timestamp tracking, and separate lot tracking for compliance and expiry management.

**Controlled Substances Tracking:**
- Items with `controlled=true` and `unit=Pack` maintain dual tracking:
  - `stock`: Quantity in packs
  - `controlledUnits`: Individual ampules for compliance
  - `packSize`: Ampules per pack (required)
- Items with `controlled=true` and `unit=Ampulle` are treated as standard items (no pack size)
- Receiving: Stock increases by packs received, controlledUnits increases by (packs × packSize)
- Administration: ControlledUnits decreases by quantity administered, stock recalculated as ⌈controlledUnits ÷ packSize⌉
- Routine Control: Verifies against controlledUnits for controlled pack items

### System Design Choices

The system supports comprehensive inventory management functionalities such as:
- **Controlled Substances Management**: Dedicated workflows for administration logging and routine verification checks with electronic signature capture, tracking individual vials/ampules while ordering in packs. Monthly PDF reports grouped by drug and sub-grouped by day with complete administration details.
- **Order Management**: End-to-end order creation, editing (including inline quantity editing, item removal, order deletion), and submission, with automatic quantity calculation based on stock deficits and PDF export for purchase orders.
- **Item Lifecycle Management**: Creation, updating, and transactional cascade deletion of items ensuring data integrity across related records (alerts, activities, order lines, lots, stock levels).
- **User Management**: A comprehensive system for creating, assigning roles, changing passwords, and deleting users, with strong security measures.
- **Signature Capture**: Print-ready black-on-white electronic signatures for all controlled substance transactions and verification checks.

## External Dependencies

**Database:**
- Neon Serverless PostgreSQL: Cloud-native PostgreSQL for scalable data storage.

**Authentication Services:**
- Replit OIDC Provider: For OAuth 2.0 / OpenID Connect authentication.
- connect-pg-simple: PostgreSQL-backed session store for session management.

**UI Component Libraries:**
- Radix UI: Unstyled, accessible component primitives.
- Shadcn/ui: Pre-configured component library built on Radix UI.
- Lucide React & Font Awesome: Icon libraries.

**Development Tools:**
- Vite plugins: For Replit integration.
- Drizzle Kit: Database migration and schema management.
- Zod: Runtime type validation.

**Barcode Scanning:**
- Browser native camera API: For 1D and 2D barcode capture, including GTIN lookup.

**Form Management:**
- React Hook Form: Form state management and validation, integrated with Zod.

**Utilities:**
- bcrypt: Password hashing.
- date-fns: Date manipulation.
- nanoid: Unique ID generation.
- memoizee: Function result caching.
- jsPDF & jspdf-autotable: PDF generation for reports (orders and controlled substances).