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

The core database schema includes `Users`, `Hospitals`, `UserHospitalRoles` (for role-based access control), `Items` (with barcode support, min/max thresholds, flags for critical/controlled items, `trackExactQuantity` flag, `currentUnits` for pack-level tracking, and `packSize` fields), `StockLevels`, `Lots` (for batch tracking and expiry), `Orders`, `OrderLines`, `Activities` (for audit trails), `Alerts`, `Vendors`, and `Locations`. Key design decisions include UUID primary keys, timestamp tracking, and separate lot tracking for compliance and expiry management.

**Stock Management System:**
- Items can be configured with two order types:
  - **Pack**: Items ordered and received in packs (boxes, cartons, etc.)
  - **Single unit**: Items ordered and received as individual units (tablets, vials, etc.)
- **Track Exact Quantity** feature (available for Pack items only):
  - `trackExactQuantity`: Boolean flag to enable pack-level tracking
  - `currentUnits`: Stores exact unit count within packs
  - `packSize`: Number of units per pack
  - Stock is auto-calculated: ⌈currentUnits ÷ packSize⌉ (ceiling division)
  - Display shows "X packs [Y units]" format
- **Order Processing**:
  - Pack items: Order qty represents number of packs
  - Single unit items: Order qty represents number of individual units
  - Receiving: Stock increases by qty, currentUnits increases by (qty × packSize) if trackExactQuantity enabled
- **Controlled Substances Administration**:
  - For items with trackExactQuantity: Deducts from currentUnits, stock auto-recalculated
  - For standard items: Deducts from stock directly
  - Routine Control: Verifies against currentUnits for trackExactQuantity items, stock otherwise

### System Design Choices

The system supports comprehensive inventory management functionalities such as:
- **Controlled Substances Management**: Dedicated workflows for administration logging and routine verification checks with electronic signature capture, tracking individual vials/ampules while ordering in packs. Monthly PDF reports grouped by drug and sub-grouped by day with complete administration details.
- **Order Management**: End-to-end order creation, editing (including inline quantity editing, item removal, order deletion), and submission, with automatic quantity calculation based on stock deficits and PDF export for purchase orders.
- **Item Lifecycle Management**: Creation, updating, and transactional cascade deletion of items ensuring data integrity across related records (alerts, activities, order lines, lots, stock levels).
- **User Management**: A comprehensive system for creating, assigning roles, changing passwords, and deleting users, with strong security measures.
- **Signature Capture**: Print-ready black-on-white electronic signatures for all controlled substance transactions and verification checks.
- **Bulk Import with AI**: License-based bulk photo import using OpenAI Vision API for automated item extraction:
  - Free tier: Up to 10 images per import
  - Basic tier: Up to 30 images per import
  - Batch processing (15 images per batch) for reliability with larger imports
  - Intelligent deduplication across batches
  - Automatic extraction of item names, descriptions, concentrations, pack sizes, and thresholds

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