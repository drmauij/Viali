# Viali - Hospital Inventory Management System

## Overview

Viali is a mobile-first web application designed to manage anesthesia drugs and general consumables across one or more hospitals. The system focuses on preventing stockouts of critical drugs, minimizing waste from expiry, automating reordering via Min-Max rules, ensuring compliance for controlled substances, and supporting multi-hospital management with per-hospital users and roles.

## Recent Changes

### October 4, 2025 - Controlled Items Pack Size Feature
- Implemented controlled items workflow that tracks individual vials/ampullas while ordering in packs
- Pack size field now appears for items with unit="single item" AND controlled=true
- Stock tracking at single-unit level (qtyOnHand represents individual vials/ampullas)
- Order conversion logic: Math.ceil(deficit / packSize) automatically calculates pack quantities
- Example: 35 vials needed with packSize=10 → orders 4 packs
- Added unit normalization to handle legacy data (vial/each/ampoule → single item, pack/box → pack)
- Backend validation ensures controlled single-item entries must have packSize > 0
- Quick order functionality works from both Items and Orders pages with proper pack conversion
- Form handlers correctly persist pack size for controlled single items
- PATCH validation checks final state (merges request with existing item) to prevent invalid updates

**Technical Implementation**: 
- normalizeUnit() function handles legacy unit values across edit and order flows
- Pack conversion applied in: quick order (Items.tsx), quick order (Orders.tsx), and order creation
- Validation at both POST /api/items and PATCH /api/items/:itemId endpoints
- Order lines store packSize snapshot for historical accuracy if pack size changes

### October 4, 2025 - Item Deletion Fix (Transactional Cascade)
- Fixed item deletion failure (500 error) caused by foreign key constraints
- Implemented transactional cascade deletion for data integrity
- Items are now deleted atomically along with all related records:
  - Alerts referencing the item
  - Activities tracking item movements
  - Order lines containing the item
  - Lots associated with the item
  - Stock levels for the item
- Wrapped entire cascade in db.transaction to ensure all-or-nothing deletion
- Critical for controlled-substance inventory to prevent orphaned data and maintain audit integrity
- Full e2e test coverage confirms deletion works correctly with transaction safety

**Technical Implementation**: The deleteItem method now uses Drizzle's transaction API to wrap all cascading deletes, ensuring that if any step fails, the entire operation rolls back and no partial state occurs.

### October 4, 2025 - Comprehensive User Management System
- Implemented complete user creation system with email/password authentication (local auth)
- Added "Create New User" workflow that creates users with bcrypt-hashed passwords stored in passwordHash column
- Implemented password change functionality for existing users with secure bcrypt hashing
- Added permanent user deletion capability (deleteUser) separate from removing hospital assignment
- Enhanced Admin panel with dual user workflows:
  - "Create New User" button for creating email/password users
  - "Assign Existing" button for assigning OIDC users to hospital
- Added four action buttons per user:
  - Edit (fa-edit icon) - Update role and location assignment
  - Change Password (fa-key icon) - Update user password with validation
  - Remove from Hospital (fa-user-minus icon, warning color) - Remove hospital assignment only
  - Delete User Permanently (fa-trash icon, destructive color) - Delete user entirely from system
- Implemented comprehensive security measures:
  - All admin endpoints verify AD role authorization
  - Password hashes sanitized from all API responses (never sent to client)
  - Passwords hashed with bcrypt using 10 rounds
  - Multiple admin authorization checks for sensitive operations
- Fixed middleware issues: removed duplicate isAdmin middleware from endpoints without hospitalId in route params
- Full e2e test coverage confirms all user management workflows functioning correctly

**Security Note**: passwordHash column added to users table. All password responses are sanitized before being sent to clients. Password updates and user creation use bcrypt hashing exclusively.

### October 4, 2025 - Order Card UX Improvements
- Made all order cards clickable to open Edit Order dialog (removed separate edit button)
- Added confirmation AlertDialog when removing items from orders to prevent accidental deletion
- Added unit type display below quantity input when editing order line items
- Improved event handling with proper stopPropagation for buttons within clickable cards
- Enhanced user experience with clear visual affordances (cursor-pointer on cards)
- Full e2e test coverage confirms all interaction patterns working correctly

### October 4, 2025 - Order Editing System
- Implemented comprehensive order editing functionality with full CRUD capabilities
- Added Edit Order dialog for draft orders with:
  - Inline quantity editing for order line items
  - Remove item functionality to delete individual order lines (with confirmation)
  - Delete entire order capability
  - Submit order directly from edit dialog
- Added location display to all order cards showing originating location(s) (derived from order items)
- Implemented API endpoints: PATCH /api/order-lines/:id, DELETE /api/order-lines/:id, DELETE /api/orders/:id
- Fixed UI state staleness issue by syncing selectedOrder state when orders query refetches
- All edit operations provide immediate visual feedback with real-time UI updates
- Full e2e test coverage confirms all functionality working correctly

### October 4, 2025 - Order Creation System
- Implemented complete order creation system with API endpoints and storage methods
- Added Quick Order button functionality that automatically calculates order quantities based on stock deficits (max threshold - actual stock)
- Created New Order dialog showing items needing reordering
- Orders use two-part structure: order header (orders table) and order lines (order_lines table)
- Only items with positive stock deficits (max > actual) generate order lines
- Fixed quick order error by using correct user ID extraction (req.user.claims.sub)
- Hidden vendor field from order cards and new order dialog (vendor is auto-selected)
- Order creation pipeline is production-ready and fully tested

**Known Issue**: upsertUser email conflict handling needs refinement - currently doesn't handle case where OIDC login uses different sub but same email (would require detecting existing user by email and merging accounts)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**
- React with TypeScript for type safety and modern UI development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching
- Shadcn/ui components built on Radix UI primitives for accessible, customizable UI components
- Tailwind CSS for utility-first styling with custom design tokens

**Design Patterns**
- Mobile-first responsive design philosophy
- Component-based architecture with reusable UI components
- Custom hooks for shared logic (useAuth, useIsMobile, useToast)
- Theme provider pattern for light/dark mode support
- Query-based data fetching with automatic caching and refetching strategies

**Key UI Features**
- Bottom navigation for mobile-optimized user experience
- Barcode scanning capability for inventory management
- Signature pad for controlled substance documentation
- Real-time item quick panels for stock adjustments
- Hospital switcher for multi-tenant functionality

### Backend Architecture

**Technology Stack**
- Express.js as the HTTP server framework
- TypeScript for type-safe server code
- Drizzle ORM for database operations with PostgreSQL
- Neon serverless PostgreSQL as the database provider
- OpenID Connect (OIDC) for authentication via Replit Auth
- Express session with PostgreSQL session store

**API Design**
- RESTful API architecture with resource-based endpoints
- Authentication middleware protecting all API routes
- JSON request/response format
- Centralized error handling and logging
- Route structure organized by feature domain

**Data Access Layer**
- Storage abstraction pattern isolating database operations
- Drizzle ORM for type-safe SQL query building
- Shared schema definitions between client and server
- Support for complex queries with joins and filtering

### Authentication & Authorization

**Authentication Strategy**
- Hybrid authentication supporting both Google OAuth and local credentials
- OpenID Connect (OIDC) integration for Replit authentication
- Session-based authentication with PostgreSQL session storage
- Per-hospital authentication method configuration (Google/Local can be enabled/disabled)

**Authorization Model**
- Multi-hospital support with user-hospital-role relationships
- Role-based access control per hospital
- User context includes hospital memberships and active hospital selection

### Database Schema

**Core Entities**
- Users: Authentication and profile information
- Hospitals: Multi-tenant organization units
- UserHospitalRoles: Many-to-many relationship with role assignments
- Items: Inventory items (drugs/consumables) with barcode support
- StockLevels: Current inventory quantities per item/hospital
- Lots: Batch tracking with expiry dates
- Orders: Purchase orders with vendor information
- OrderLines: Line items for orders
- Activities: Audit trail for all inventory actions
- Alerts: System-generated notifications
- Vendors: Supplier information
- Locations: Storage location tracking

**Key Design Decisions**
- UUID primary keys for distributed system compatibility
- Timestamp tracking (createdAt/updatedAt) on all entities
- Boolean flags for item properties (critical, controlled)
- Min/Max thresholds for automated reordering logic
- Separate lot tracking for expiry management and compliance

### External Dependencies

**Database**
- Neon Serverless PostgreSQL: Cloud-native PostgreSQL with connection pooling and serverless scaling
- WebSocket support for real-time database connections via @neondatabase/serverless

**Authentication Services**
- Replit OIDC Provider: OAuth 2.0 / OpenID Connect authentication
- Session management via connect-pg-simple for PostgreSQL-backed sessions

**UI Component Libraries**
- Radix UI: Unstyled, accessible component primitives
- Shadcn/ui: Pre-configured component library built on Radix UI
- Lucide React: Icon library
- Font Awesome: Additional icon support

**Development Tools**
- Vite plugins for Replit integration (@replit/vite-plugin-cartographer, @replit/vite-plugin-dev-banner)
- Drizzle Kit: Database migration and schema management
- Zod: Runtime type validation for forms and API inputs

**Barcode Scanning**
- Browser native camera API for barcode capture
- Support for 1D (EAN, UPC, Code128, GS1-128) and 2D (QR, DataMatrix) formats
- GTIN (Global Trade Item Number) lookup system

**Form Management**
- React Hook Form: Form state management and validation
- Hookform Resolvers: Integration with Zod schemas for validation

**Utilities**
- bcrypt: Password hashing for local authentication
- date-fns: Date manipulation and formatting
- nanoid: Unique ID generation
- memoizee: Function result caching