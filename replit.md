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

The core database schema includes `Users`, `Hospitals`, `UserHospitalRoles` (for role-based access control), `Items` (with barcode support, min/max thresholds, flags for critical/controlled items, `trackExactQuantity` flag, `currentUnits` for pack-level tracking, and `packSize` fields), `StockLevels`, `Lots` (for batch tracking and expiry), `Orders`, `OrderLines`, `Activities` (for audit trails), `Alerts`, `Vendors`, `Locations`, `ImportJobs` (for async bulk import processing with job queue management), `ChecklistTemplates` (recurring equipment check templates with JSONB items field), and `ChecklistCompletions` (completed checklist records). Key design decisions include UUID primary keys, timestamp tracking, separate lot tracking for compliance and expiry management, and JSONB storage for temporary bulk import data and checklist items. For JSONB fields with specific structures (like checklist items), explicit Zod validation is added via `.extend()` to ensure type safety.

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
- **Item Lifecycle Management**: Creation, updating, and transactional cascade deletion of items ensuring data integrity across related records (alerts, activities, order lines, lots, stock levels). Items support image uploads with automatic compression (max 800px, 0.8 quality JPEG) for visual identification, stored as base64 in the database. Edit dialog uses a tabbed interface with "Item Details" and "Item Photo" sections for better organization (matching the Controlled Substances page pattern). Image preview displays at 500px max-height with click-to-zoom functionality for full-screen viewing. Safety feature: Delete/Save/Cancel buttons hide when on Photo tab to prevent accidental item deletion; Delete Image button available in Photo tab for removing item images.
- **User Management**: A comprehensive system for creating, assigning roles, changing passwords, and deleting users, with strong security measures.
- **Signature Capture**: Print-ready black-on-white electronic signatures for all controlled substance transactions and verification checks.
- **Custom Sorting**: Drag-and-drop functionality for organizing folders in a custom order:
  - Folders have a `sortOrder` field for persistent custom ordering
  - Default display follows custom sort order (sortOrder ascending, then name alphabetically)
  - **Folder Reordering**: Drag-and-drop to reorder folders within location
    - Visual drop indicator (horizontal line) shows where folder will be inserted (above/below target)
    - Custom collision detection using `closestCorners` for accurate drop target resolution
    - Prevents folder nesting - folders can only reorder in the list
    - Bulk sort API endpoint (`/api/folders/bulk-sort`) for efficient updates
  - **Item Management**: Items can be dragged to folders or root, but not reordered within folders
    - Drag item to folder header to move it to that folder
    - Drag item to root area to remove from folder
    - Custom collision detection filters out the item's current parent folder to prevent false positive drops
  - Other sorting options (alphabetical, stock level) remain available alongside custom ordering
- **Bulk Import with AI**: AI-powered bulk photo import using OpenAI Vision API for automated item extraction with asynchronous job processing:
  - Basic accounts: Up to 50 images per import
  - Free accounts: Up to 10 images per import (previously limited to 3 due to synchronous processing)
  - **Async Architecture**: Images uploaded and processed via background job queue system
    - Job creation is instant (< 1 second response time)
    - Background worker processes images asynchronously within 30-second timeout
    - Batch processing completes in 12-20 seconds for up to 3 images
    - Email notifications sent upon completion with preview links
    - Frontend polls job status every 2 seconds for real-time updates
  - **Implementation Details**:
    - Images temporarily stored in `import_jobs.imagesData` JSONB field
    - Job states: queued → processing → completed/failed
    - Worker auto-triggered on job creation (fire-and-forget pattern)
    - Images cleared from database after processing to free storage
  - Automatic extraction of item names, descriptions, concentrations, pack sizes, and thresholds
  - Users can import multiple times for larger inventories (no daily limit on import sessions)

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